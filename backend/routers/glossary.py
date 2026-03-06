from fastapi import APIRouter
import google.generativeai as genai
import os

router = APIRouter(prefix='/glossary', tags=['glossary'])
genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
model = genai.GenerativeModel('gemini-2.5-flash')

@router.get('/explain')
async def explain_vaccine(name: str, language: str = 'english'):
    """Generate a plain-language vaccine explanation using Gemini."""
    prompt = f'''
Explain the vaccine called "{name}" to a non-medical Indian parent.
Respond in {language}.
Keep it under 80 words. Use simple words. No medical jargon.
Include: what disease it prevents, why it matters, and one sentence about side effects.
Format: 3 short sentences maximum.
    '''
    try:
        resp = model.generate_content(prompt)
        return {'vaccine': name, 'language': language, 'explanation': resp.text, 'source': 'gemini'}
    except Exception as e:
        return {'vaccine': name, 'explanation': f'Explanation for {name} — please consult your doctor.', 'source': 'fallback'}
