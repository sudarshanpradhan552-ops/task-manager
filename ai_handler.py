import os
import json
import google.generativeai as genai
from openai import OpenAI
from dotenv import load_dotenv
from typing import Optional

load_dotenv()

# Setup OpenAI
openai_api_key = os.getenv("OPENAI_API_KEY")
openai_client = OpenAI(api_key=openai_api_key) if openai_api_key else None

# Setup Gemini
gemini_api_key = os.getenv("GOOGLE_API_KEY")
if gemini_api_key:
    genai.configure(api_key=gemini_api_key)
    gemini_model = genai.GenerativeModel('gemini-1.5-flash')
else:
    gemini_model = None

def parse_task_with_ai(prompt: str):
    system_prompt = """
    You are a task management assistant. Extract task details.
    Return ONLY a JSON object with:
    - title (string)
    - description (string or null)
    - priority (low, medium, high)
    - due_date (ISO format string or null)
    - estimated_minutes (integer)
    - category (Work, Personal, etc.)
    Today's date: {today}.
    """
    from datetime import datetime
    today = datetime.now().strftime("%Y-%m-%d")

    try:
        if gemini_model:
            response = gemini_model.generate_content(
                f"{system_prompt.format(today=today)}\n\nUser Prompt: {prompt}",
                generation_config={"response_mime_type": "application/json"}
            )
            return json.loads(response.text)
        elif openai_client:
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "system", "content": system_prompt.format(today=today)}, {"role": "user", "content": prompt}],
                response_format={ "type": "json_object" }
            )
            return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"AI Error: {e}")
    
    return {
        "title": prompt[:100],
        "description": "Added via fallback",
        "priority": "medium",
        "due_date": None,
        "estimated_minutes": 15,
        "category": "General"
    }

def decompose_task_with_ai(task_title: str, task_description: str = ""):
    """
    AI breaks a task into 3-5 logical sub-tasks.
    """
    system_prompt = """
    You are a project management assistant. 
    Break the user's task into exactly 3 to 5 logical sub-tasks.
    Return ONLY a JSON object with a 'subtasks' field containing a list of strings.
    """
    
    user_content = f"Task: {task_title}\nDescription: {task_description}"
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            response_format={ "type": "json_object" }
        )
        data = json.loads(response.choices[0].message.content)
        return data.get("subtasks", [])
    except Exception as e:
        print(f"AI decomposition error: {e}")
        return []

def generate_daily_briefing(tasks_list: list):
    if not tasks_list:
        return "You have a clear schedule today!"

    prompt = f"""
    You are a productivity coach. Provide a 3-sentence summary:
    1. Total workload.
    2. Most critical priority.
    3. Motivational push.
    Tasks: {str(tasks_list)}
    """
    try:
        if gemini_model:
            response = gemini_model.generate_content(prompt)
            return response.text
        elif openai_client:
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}]
            )
            return response.choices[0].message.content
    except Exception as e:
        print(f"Briefing Error: {e}")
        
    return f"You have {len(tasks_list)} tasks to look at today. Start with the most important one!"

def suggest_priority(title: str, description: str):
    """
    AI suggests priority based on task content.
    """
    # Placeholder for prioritization logic
    pass
