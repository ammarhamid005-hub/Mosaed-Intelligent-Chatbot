import os
import re
from dotenv import load_dotenv

load_dotenv()

# Which model answers the questions: "gemini" (default), "deepseek" or "groq".
# Embeddings are NOT affected by this setting; they always use Gemini.
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini").strip().lower()

api_key = os.getenv("GEMINI_API_KEY")
model_name = os.getenv("GEMINI_LLM_MODEL", "models/gemini-2.5-flash")

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-flash")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

# Groq hosts open models (gpt-oss-120b, gpt-oss-20b, qwen3.8-27b, ...) behind an OpenAI-compatible API.
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")


def _extract_text(content) -> str:
    """Extract string content whether the model returns a string or a list of content blocks."""
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


def get_model_label() -> str:
    """Name of the model currently answering (used in logs and evaluation reports)."""
    if LLM_PROVIDER == "deepseek":
        return DEEPSEEK_MODEL
    if LLM_PROVIDER == "groq":
        return GROQ_MODEL.split("/")[-1]
    return model_name


def get_gemini_client(temperature=0.2, max_tokens=700):
    if not api_key:
        raise ValueError("GEMINI_API_KEY is missing. Add it to your .env file.")
    from langchain_google_genai import ChatGoogleGenerativeAI
    return ChatGoogleGenerativeAI(
        model=model_name,
        google_api_key=api_key,
        temperature=temperature,
        max_output_tokens=max_tokens,
    )


def get_deepseek_client(temperature=0.2, max_tokens=700):
    if not DEEPSEEK_API_KEY:
        raise ValueError("DEEPSEEK_API_KEY is missing. Add it to your .env file.")
    # DeepSeek uses an OpenAI-compatible API, so the OpenAI client works with its URL.
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model=DEEPSEEK_MODEL,
        api_key=DEEPSEEK_API_KEY,
        base_url=DEEPSEEK_BASE_URL,
        temperature=temperature,
        max_tokens=max_tokens,
    )


def get_groq_client(temperature=0.2, max_tokens=700):
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is missing. Add it to your .env file.")
    from langchain_openai import ChatOpenAI
    return ChatOpenAI(
        model=GROQ_MODEL,
        api_key=GROQ_API_KEY,
        base_url=GROQ_BASE_URL,
        temperature=temperature,
        max_tokens=max_tokens,
        max_retries=6,  # the free tier answers 429 when the per-minute token limit is hit; wait and retry
    )


def get_llm_client(temperature=0.2, max_tokens=700):
    if LLM_PROVIDER == "groq":
        return get_groq_client(temperature, max_tokens)
    if LLM_PROVIDER == "deepseek":
        return get_deepseek_client(temperature, max_tokens)
    if LLM_PROVIDER == "gemini":
        return get_gemini_client(temperature, max_tokens)
    raise ValueError(f"Unknown LLM_PROVIDER '{LLM_PROVIDER}'. Use gemini, deepseek or groq.")


_THINK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def _clean(text: str) -> str:
    """Remove a reasoning block (<think>...</think>) that some open models put before the answer."""
    return _THINK.sub("", text).strip()


def generate_answer(system_prompt: str, user_prompt: str) -> str:
    llm = get_llm_client(temperature=0.2, max_tokens=2048)
    messages = [("system", system_prompt), ("human", user_prompt)]
    response = llm.invoke(messages)
    return _clean(_extract_text(response.content))


def generate_text(prompt: str) -> str:
    # Reasoning models can spend tokens "thinking" before the rewritten question, so allow more room.
    llm = get_llm_client(temperature=0.2, max_tokens=200 if LLM_PROVIDER != "groq" else 1024)
    response = llm.invoke(prompt)
    return _clean(_extract_text(response.content))
