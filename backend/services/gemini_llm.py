import os
from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI

load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
model_name = os.getenv("GEMINI_LLM_MODEL", "models/gemini-2.5-flash")


def _extract_text(content) -> str:
    """Extract string content whether Gemini returns a string or a list of content blocks."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, dict) and "text" in part:
                parts.append(part["text"])
        return "".join(parts)
    return str(content)


def get_gemini_client(temperature=0.2, max_tokens=700):
    if not api_key:
        raise ValueError("GEMINI_API_KEY is missing. Add it to your .env file.")
    return ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=api_key,
        temperature=temperature,
        max_output_tokens=max_tokens,
    )


def generate_answer(system_prompt: str, user_prompt: str) -> str:
    llm = get_gemini_client(temperature=0.2, max_tokens=700)
    messages = [("system", system_prompt), ("human", user_prompt)]
    response = llm.invoke(messages)
    return _extract_text(response.content)


def generate_text(prompt: str) -> str:
    llm = get_gemini_client(temperature=0.2, max_tokens=200)
    response = llm.invoke(prompt)
    return _extract_text(response.content)