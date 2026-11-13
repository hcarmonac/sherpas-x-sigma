import os

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

cliente = OpenAI(
    base_url=os.environ["LLM_PROXY_URL"].rstrip("/") + "/v1",
    api_key=os.environ["TEAM_KEY"],
)

respuesta = cliente.chat.completions.create(
    model="gpt-5-mini",
    messages=[
        {
            "role": "user",
            "content": "Explica en español qué es un fondo de emergencia en dos frases.",
        }
    ],
)

print(respuesta.choices[0].message.content)
