
import { GoogleGenAI, Type } from "@google/genai";
import { Shift, Employee } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getScheduleOptimizationInsights = async (shifts: Shift[], employees: Employee[]) => {
  const prompt = `
    As a workforce optimization expert for Shiftly, analyze the following schedule and roster.
    
    Employees: ${JSON.stringify(employees.map(e => ({ name: e.name, productivity: e.productivityScore, rate: e.hourlyRate, availability: e.availability })))}
    Current Assignments: ${JSON.stringify(shifts.map(s => ({ day: s.day, shift: s.type, target: s.targetSales, assigned: s.assignedEmployeeId })))}

    Provide a professional report in Hebrew (Markdown) covering:
    1. **ניתוח כיסוי**: האם המשמרות המרכזיות מאוישות?
    2. **אופטימיזציית מכירות**: האם העובדים עם התפוקה הגבוהה ביותר שובצו למשמרות עם יעד המכירות הגבוה ביותר?
    3. **ניהול עלויות**: הצעות לחיסכון בשכר מבלי לפגוע ביעדים.
    4. **סיכום והמלצות**: 3 פעולות לביצוע מיידי.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "שגיאה בטעינת ניתוח הבינה המלאכותית.";
  }
};

export const getSmartSuggestion = async (shift: Shift, employees: Employee[]) => {
  const prompt = `
    For a Shiftly-managed store, we have a ${shift.type} shift on ${shift.day} with a sales target of $${shift.targetSales}.
    Which of these employees is the best fit? Consider their productivity score and hourly rate.
    
    Candidates: ${JSON.stringify(employees.map(e => ({ id: e.id, name: e.name, productivity: e.productivityScore, rate: e.hourlyRate })))}
    
    Respond ONLY with the employee ID of the best candidate and a one-sentence reason in Hebrew.
    Format: ID | REASON
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Suggestion Error:", error);
    return null;
  }
};

export const autoGenerateSchedule = async (shifts: Shift[], employees: Employee[]) => {
  const prompt = `
    You are an AI Manager for Shiftly. Your task is to fill all empty shifts with the most suitable employees from the roster.
    
    Rules:
    1. Match high productivity employees to shifts with high sales targets.
    2. Respect availability (if provided).
    3. Try to balance the workload across employees.
    
    Employees: ${JSON.stringify(employees.map(e => ({ id: e.id, name: e.name, productivity: e.productivityScore, availability: e.availability })))}
    Shifts to fill: ${JSON.stringify(shifts.map(s => ({ id: s.id, day: s.day, target: s.targetSales })))}
    
    Return a JSON object containing an array of assignments.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            assignments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  shiftId: { type: Type.STRING },
                  employeeId: { type: Type.STRING }
                },
                required: ["shiftId", "employeeId"]
              }
            }
          },
          required: ["assignments"]
        }
      }
    });
    
    const result = JSON.parse(response.text);
    return result.assignments as { shiftId: string, employeeId: string }[];
  } catch (error) {
    console.error("Auto Schedule Error:", error);
    return null;
  }
};
