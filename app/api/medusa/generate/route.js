import { NextResponse } from 'next/server';

export async function POST(req) {
    try {
        const { prompt, fileData, isImagePrompt } = await req.json();
        const API_KEY = process.env.GEMINI_API_KEY;

        if (isImagePrompt && fileData) {
            // Updated to gemini-3.8-flash
            const visionUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-3.8-flash:generateContent?key=${API_KEY}`;
            const visionResponse = await fetch(visionUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        role: "user",
                        parts: [
                            { text: "Describe the physical appearance of the main subject in this image in extreme detail (facial features, hair, clothing). Do not describe the background." },
                            { inline_data: { mime_type: "image/jpeg", data: fileData } }
                        ]
                    }]
                })
            });
            const visionData = await visionResponse.json();
            if (visionData.error) throw new Error(`Vision API Error: ${visionData.error.message}`);
            
            const subjectDescription = visionData.candidates[0].content.parts[0].text;
            const finalPrompt = `A highly detailed, petrified solid stone statue of a person matching this description: ${subjectDescription}. Realistic weathered granite texture, cinematic dark background, glowing cyan and pink ambient lighting. ${prompt}`;
            
            const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${API_KEY}`;
            const imagenResponse = await fetch(imagenUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instances: [{ prompt: finalPrompt }],
                    parameters: { sampleCount: 1, aspectRatio: "1:1" }
                })
            });
            const imagenData = await imagenResponse.json();
            if (imagenData.error) throw new Error(`Imagen API Error: ${imagenData.error.message}`);
            
            return NextResponse.json(imagenData, { status: 200 });
        } 
        else if (isImagePrompt && !fileData) {
            const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${API_KEY}`;
            const response = await fetch(imagenUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instances: [{ prompt: prompt }],
                    parameters: { sampleCount: 1, aspectRatio: "1:1" }
                })
            });
            const data = await response.json();
            if (data.error) throw new Error(`Imagen API Error: ${data.error.message}`);
            
            return NextResponse.json(data, { status: 200 });
        }
        else {
            // Updated to gemini-3.8-flash
            const textUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-3.8-flash:generateContent?key=${API_KEY}`;
            const response = await fetch(textUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
            });
            const data = await response.json();
            if (data.error) throw new Error(`Text API Error: ${data.error.message}`);
            
            return NextResponse.json(data, { status: 200 });
        }
    } catch (error) {
        console.error("Proxy Execution Failed:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}


