import { GoogleGenAI } from "@google/genai";
import type { MotoGpData, ChatMessage, PlayerScore } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const chatWithData = async (data: MotoGpData, rawCsv: string, history: ChatMessage[], query: string): Promise<string> => {
    // Enviamos tanto los datos estructurados como los brutos. El LLM puede usar los datos estructurados para preguntas fáciles
    // y los datos brutos para preguntas sobre partes que no hemos procesado (como los resultados oficiales de MotoGP).

    const formattedHistory = history.map(msg => `${msg.role}: ${msg.content}`).join('\n');

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

La conversación anterior fue:
--- HISTORIAL ---
${formattedHistory}
--- FIN DEL HISTORIAL ---

La nueva pregunta del usuario es: "${query}"

Responde a la pregunta del usuario basándote en los datos proporcionados. Utiliza los datos estructurados siempre que sea posible para preguntas sobre clasificaciones, carreras y votos de jugadores. Consulta los datos CSV si te preguntan por los resultados oficiales de las carreras de MotoGP (SPR y RACE) que se encuentran en la parte inferior del archivo. Sé conciso, servicial y utiliza la jerga de MotoGP si es apropiado. La respuesta debe estar en español.`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });

    return response.text;
};

export const getStatisticalInsight = async (data: MotoGpData, selectedPlayers: PlayerScore[]): Promise<string> => {
    if (selectedPlayers.length === 0) {
        return "Selecciona uno o más jugadores para ver una curiosidad estadística.";
    }

    const playerNames = selectedPlayers.map(p => p.player).join(', ');
    
    // Simplificamos los datos para que el prompt sea más manejable
    const relevantData = {
        races: data.races.map(r => r.circuit),
        selectedPlayersData: selectedPlayers,
        playerVotes: data.playerVotes.filter(pv => selectedPlayers.some(sp => sp.player === pv.player)),
    };

    const prompt = `Eres un analista de datos experto en MotoGP y muy creativo. Estás analizando los datos de una liga de fans.
Los jugadores seleccionados son: ${playerNames}.
Sus datos de puntuación y votos son:
${JSON.stringify(relevantData, null, 2)}

Tu tarea es generar UNA ÚNICA CURIOSIDAD estadística, dato interesante o comparativa sorprendente sobre el/los jugador/es seleccionado/s. Sé breve (máximo 2 frases), directo y utiliza un tono entusiasta. La respuesta debe estar en español.

Algunos ejemplos de lo que podrías generar:
- Si hay un jugador: "La mejor racha de [Jugador] fue de X puntos en 3 carreras (de [Carrera A] a [Carrera B])!"
- Si hay dos jugadores: "¡La mayor diferencia de puntos entre [Jugador A] y [Jugador B] fue de X puntos en [Carrera C]!"
- Si coinciden en votos: "[Jugador A] y [Jugador B] han votado por el mismo piloto en 4 ocasiones, ¡mostrando una estrategia similar!"
- Sobre un piloto votado: "[Jugador A] ha votado por [Piloto X] en 5 de las 8 carreras, ¡su piloto fetiche!"

Ahora, genera una nueva y original curiosidad basada en los datos proporcionados.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Error fetching statistical insight:", error);
        return "No se pudo generar la curiosidad. Inténtalo de nuevo.";
    }
};