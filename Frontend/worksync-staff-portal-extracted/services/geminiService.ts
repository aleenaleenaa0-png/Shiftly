
import { GoogleGenAI } from "@google/genai";
import { Shift } from "../types";

export const getScheduleInsights = async (shifts: Shift[], userName: string) => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    
    const scheduleSummary = shifts
      .map(s => `${s.date}: ${s.workerName} (${s.startTime}-${s.endTime}) as ${s.role}`)
      .join('\n');

    const prompt = `
      As an AI assistant for a workplace, analyze this finalized schedule for ${userName}.
      Schedule:
      ${scheduleSummary}

      Provide a brief, friendly summary (2-3 sentences) specifically for ${userName}. 
      Highlight their shifts, total hours (estimate), and any day where they are the only ones working or if there is a gap.
      Format: Return as plain text.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Could not load AI insights at this time. Please check your schedule manually.";
  }
};
