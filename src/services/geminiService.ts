import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function getFirstAidInstructions(emergency: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Provide immediate, clear, step-by-step first aid instructions for: ${emergency}. 
    Keep it concise and prioritize life-saving actions. 
    Use markdown for formatting. 
    Always include a disclaimer that professional medical help should be called immediately.`,
  });
  return response.text;
}

export async function findNearbyHospitals(lat: number, lng: number) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Find real hospitals near coordinates ${lat}, ${lng}. 
    Provide their names, addresses, and general specialties.`,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: {
            latitude: lat,
            longitude: lng
          }
        }
      }
    },
  });
  
  // Note: In a real app, we'd parse the grounding chunks. 
  // For this demo, we'll return the text and the chunks for the UI to display.
  return {
    text: response.text,
    chunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks
  };
}
