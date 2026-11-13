import asyncio
import json
import os

from dotenv import load_dotenv
from mcp import ClientSession
from mcp.client.streamable_http import (
    create_mcp_http_client,
    streamable_http_client,
)
from openai import OpenAI

load_dotenv()


async def obtener_plan():
    http = create_mcp_http_client(
        headers={
            "Authorization": f"Bearer {os.environ['MCP_TOKEN']}"
        }
    )

    async with streamable_http_client(
        os.environ["MCP_URL"],
        http_client=http,
    ) as (read, write, *_):
        async with ClientSession(read, write) as mcp:
            await mcp.initialize()

            herramientas = await mcp.list_tools()
            print("Herramientas:", [h.name for h in herramientas.tools])

            resultado = await mcp.call_tool(
                "get_case",
                {
                    "caseId": "daniel-emily-johnson",
                    "part": "financial-health",
                    "section": "narrative",
                },
            )

            if resultado.is_error:
                raise RuntimeError(str(resultado.content))

            return json.loads(resultado.content[0].text)["value"]


plan = asyncio.run(obtener_plan())
print("Datos del caso recibidos correctamente.")

cliente = OpenAI(
    base_url=os.environ["LLM_PROXY_URL"].rstrip("/") + "/v1",
    api_key=os.environ["TEAM_KEY"],
)

respuesta = cliente.chat.completions.create(
    model="gpt-5-mini",
    messages=[
        {
            "role": "system",
            "content": (
                "Explica en español el plan financiero existente de esta familia. "
                "Utiliza únicamente los datos proporcionados. "
                "No inventes cifras ni cálculos que no estén incluidos. "
                "Si falta información, indícalo.\n\n"
                + json.dumps(plan, ensure_ascii=False)
            ),
        },
        {
            "role": "user",
            "content": (
                "Resume nuestra situación y explica las principales "
                "recomendaciones del plan con palabras sencillas."
            ),
        },
    ],
)

print("\nRespuesta del modelo:\n")
print(respuesta.choices[0].message.content)