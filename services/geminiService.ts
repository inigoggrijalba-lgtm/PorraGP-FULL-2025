import { GoogleGenAI } from "@google/genai";
import type { MotoGpData, ChatMessage, ApiBroadcastEvent } from '../types';

export const chatWithData = async (data: MotoGpData, rawCsv: string, history: ChatMessage[], query: string, calendar: ApiBroadcastEvent[] | null = null): Promise<string> => {
    // La inicialización y la comprobación de la clave se mueven aquí para evitar que se ejecuten al cargar el módulo.
    if (!process.env.API_KEY) {
      throw new Error("La clave API de Gemini no está configurada. La función de chat está deshabilitada.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Enviamos tanto los datos estructurados como los brutos. El LLM puede usar los datos estructurados para preguntas fáciles
    // y los datos brutos para preguntas sobre partes que no hemos procesado (como los resultados oficiales de MotoGP).

    const formattedHistory = history.map(msg => `${msg.role}: ${msg.content}`).join('\n');

    let calendarContext = "";
    if (calendar && calendar.length > 0) {
        const simplifiedCalendar = calendar.map(e => ({
            name: e.name,
            date_start: e.date_start,
            date_end: e.date_end,
            circuit: e.circuit?.name || "Unknown",
            country: e.country,
            status: e.status
        }));
        calendarContext = `
Aquí está el calendario oficial de eventos de MotoGP (2025):
--- CALENDARIO ---
${JSON.stringify(simplifiedCalendar, null, 2)}
--- FIN CALENDARIO ---
`;
    }

    const prompt = `Eres un asistente experto en MotoGP y analista de datos para una liga de fans. Estás analizando los datos de su campeonato.

Contexto adicional sobre MotoGP para tu conocimiento:
- La "Carrera del sábado" o "Carrera corta" se refiere a la carrera "SPRINT" (etiquetada como SPR en los datos).
- La "Carrera del domingo" o "carrera larga" se refiere a la carrera principal "RACE".

Aquí están los datos estructurados que ya he procesado:
--- DATOS ESTRUCTURADOS (JSON) ---
${JSON.stringify(data, null, 2)}
--- FIN DE DATOS ESTRUCTURADOS ---

Y aquí están los datos completos en formato CSV original, por si necesitas consultar algo que no esté en el JSON (como los resultados oficiales de MotoGP en la parte inferior):
--- DATOS CSV COMPLETOS ---
${rawCsv}
--- FIN DE DATOS CSV ---
${calendarContext}

La conversación anterior fue:
--- HISTORIAL ---
${formattedHistory}
--- FIN DEL HISTORIAL ---

La nueva pregunta del usuario es: "${query}"

Responde a la pregunta del usuario basándote en los datos proporcionados. Utiliza los datos estructurados siempre que sea posible para preguntas sobre clasificaciones, carreras y votos de jugadores. Consulta los datos CSV si te preguntan por los resultados oficiales de las carreras de MotoGP (SPR y RACE) que se encuentran en la parte inferior del archivo. Si preguntan por el calendario o próximas carreras, usa la información del CALENDARIO proporcionada. Sé conciso, servicial y utiliza la jerga de MotoGP si es apropiado. La respuesta debe estar en español.`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });

    return response.text || '';
};