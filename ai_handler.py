import os
import json
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Setup Gemini
gemini_api_key = os.getenv("GOOGLE_API_KEY")
if gemini_api_key:
    genai.configure(api_key=gemini_api_key)
    gemini_model = genai.GenerativeModel('gemini-1.5-flash')
    print("INFO: Gemini AI configured successfully.")
else:
    gemini_model = None
    print("WARNING: GOOGLE_API_KEY not set. AI features will use fallback responses.")


def parse_task_with_ai(prompt: str):
    """Use Gemini to parse a natural language task into structured data."""
    from datetime import datetime
    today = datetime.now().strftime("%Y-%m-%d")

    system_prompt = f"""
    You are a task management assistant. Extract task details from the user's prompt.
    Return ONLY a valid JSON object with these fields:
    - title (string)
    - description (string or null)
    - priority (must be one of: low, medium, high)
    - due_date (ISO format string like "2024-01-20T10:00:00" or null)
    - estimated_minutes (integer)
    - category (string like Work, Personal, Health, etc.)
    Today's date is: {today}.
    """

    if gemini_model:
        try:
            response = gemini_model.generate_content(
                f"{system_prompt}\n\nUser Prompt: {prompt}",
                generation_config={"response_mime_type": "application/json"}
            )
            return json.loads(response.text)
        except Exception as e:
            print(f"Gemini parse_task error: {e}")

    # Fallback if Gemini is not configured or fails
    return {
        "title": prompt[:100],
        "description": None,
        "priority": "medium",
        "due_date": None,
        "estimated_minutes": 30,
        "category": "General"
    }


def decompose_task_with_ai(task_title: str, task_description: str = ""):
    """Use Gemini to break a task into 3-5 sub-tasks."""
    system_prompt = """
    You are a project management assistant.
    Break the user's task into exactly 3 to 5 logical sub-tasks.
    Return ONLY a valid JSON object with a 'subtasks' field containing a list of strings.
    Example: {"subtasks": ["Research the topic", "Create outline", "Write draft"]}
    """
    user_content = f"Task: {task_title}\nDescription: {task_description}"

    if gemini_model:
        try:
            response = gemini_model.generate_content(
                f"{system_prompt}\n\n{user_content}",
                generation_config={"response_mime_type": "application/json"}
            )
            data = json.loads(response.text)
            return data.get("subtasks", [])
        except Exception as e:
            print(f"Gemini decompose_task error: {e}")

    return []


def generate_daily_briefing(tasks_list: list):
    """Use Gemini to generate a daily productivity briefing."""
    if not tasks_list:
        return "You have a clear schedule today! Great time to plan ahead or tackle a new goal. 🚀"

    prompt = f"""
    You are a productivity coach. Given the following task list, provide a concise 3-sentence briefing:
    1. Summarize the total workload.
    2. Highlight the most critical priority.
    3. End with a motivational push.
    Tasks: {str(tasks_list)}
    """

    if gemini_model:
        try:
            response = gemini_model.generate_content(prompt)
            return response.text
        except Exception as e:
            print(f"Gemini briefing error: {e}")

    return f"You have {len(tasks_list)} tasks today. Focus on the most important one first, and take it step by step. You've got this! 💪"
