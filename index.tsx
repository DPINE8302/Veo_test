/* tslint:disable */
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {GenerateVideosParameters, GoogleGenAI, Type} from '@google/genai';

// Constants
const GEMINI_API_KEY = process.env.API_KEY;

// DOM Elements
const upload = document.querySelector('#file-input') as HTMLInputElement;
const promptEl = document.querySelector('#prompt-input') as HTMLTextAreaElement;
const generateButton = document.querySelector(
  '#generate-button',
) as HTMLButtonElement;
const statusEl = document.querySelector('#status') as HTMLDivElement;
const sceneContainer = document.querySelector(
  '#scene-container',
) as HTMLDivElement;
const quotaErrorEl = document.querySelector('#quota-error') as HTMLDivElement;
const openKeyEl = document.querySelector('#open-key') as HTMLButtonElement;
const fileNameEl = document.querySelector('#file-name') as HTMLSpanElement;
const resultsContainer = document.querySelector('#results-container') as HTMLElement;


// App State
let base64data = '';
let movieIdea = '';

// Helper Functions
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      resolve(url.split(',')[1]);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(blob);
  });
}

// AI Generation Functions
async function generateScenePrompts(idea: string): Promise<string[]> {
  statusEl.innerText = 'Generating scene descriptions...';
  const ai = new GoogleGenAI({apiKey: GEMINI_API_KEY});

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Based on the following movie idea, break it down into a series of 4 distinct, sequential scene descriptions. Each description should be a detailed visual prompt for an AI video generator and should result in a 5-second video clip. Ensure the scenes connect logically to tell a coherent story and maintain a consistent theme. The output must be a JSON array of strings. Movie Idea: ${idea}`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.STRING,
          description:
            'A single, detailed scene description for a video generation model.',
        },
      },
    },
  });

  const prompts = JSON.parse(response.text);
  if (!Array.isArray(prompts) || prompts.length === 0) {
    throw new Error('Could not generate scene descriptions.');
  }
  return prompts;
}

async function generateVideoForScene(
  prompt: string,
  imageBytes: string,
  sceneIndex: number,
  totalScenes: number,
) {
  statusEl.innerText = `Generating scene ${sceneIndex + 1} of ${totalScenes}...`;
  const ai = new GoogleGenAI({apiKey: GEMINI_API_KEY});

  const config: GenerateVideosParameters = {
    model: 'veo-2.0-generate-001',
    prompt,
    config: {
      durationSeconds: 5,
      numberOfVideos: 1,
    },
  };

  if (imageBytes) {
    config.image = {
      imageBytes,
      mimeType: 'image/png',
    };
  }

  let operation = await ai.models.generateVideos(config);

  while (!operation.done) {
    console.log(`Waiting for completion of scene ${sceneIndex + 1}`);
    await delay(10000); // Polling every 10 seconds
    operation = await ai.operations.getVideosOperation({operation});
  }

  const videos = operation.response?.generatedVideos;
  if (videos === undefined || videos.length === 0) {
    throw new Error(`No video generated for scene ${sceneIndex + 1}`);
  }

  const videoData = videos[0];
  const url = decodeURIComponent(videoData.video.uri);
  // As per docs, API key must be appended to fetch the video
  const res = await fetch(`${url}&key=${GEMINI_API_KEY}`);
  const blob = await res.blob();
  const objectURL = URL.createObjectURL(blob);

  // Show results container if it's the first video
  if (sceneIndex === 0) {
    resultsContainer.style.display = 'block';
  }

  const videoEl = document.createElement('video');
  videoEl.src = objectURL;
  videoEl.autoplay = true;
  videoEl.loop = true;
  videoEl.controls = true;
  videoEl.muted = true; // Required for autoplay in most browsers
  videoEl.title = `Scene ${sceneIndex + 1}: ${prompt}`;
  sceneContainer.appendChild(videoEl);
}

// Main Orchestrator
async function generateMovie() {
  statusEl.innerText = 'Starting movie generation...';
  sceneContainer.innerHTML = '';
  resultsContainer.style.display = 'none';

  generateButton.disabled = true;
  upload.disabled = true;
  promptEl.disabled = true;
  quotaErrorEl.style.display = 'none';

  try {
    const scenePrompts = await generateScenePrompts(movieIdea);

    for (let i = 0; i < scenePrompts.length; i++) {
      await generateVideoForScene(
        scenePrompts[i],
        base64data,
        i,
        scenePrompts.length,
      );
    }

    statusEl.innerText = 'Movie generation complete!';
  } catch (e) {
    try {
      // Attempt to parse API error
      const err = JSON.parse(e.message);
      if (err.error?.code === 429) {
        quotaErrorEl.style.display = 'block';
        statusEl.innerText = 'Quota exceeded. Please add a paid API key to continue.';
      } else {
        statusEl.innerText = err.error?.message || 'An unknown error occurred.';
      }
    } catch (parseErr) {
      // Fallback for non-JSON errors
      statusEl.innerText = e.message;
      console.error('Generation Error:', e);
    }
  } finally {
    generateButton.disabled = false;
    upload.disabled = false;
    promptEl.disabled = false;
  }
}

// Event Listeners
upload.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  const imgPreview = document.querySelector('#img') as HTMLImageElement;
  if (file) {
    base64data = await blobToBase64(file);
    imgPreview.src = URL.createObjectURL(file);
    imgPreview.style.display = 'block';
    fileNameEl.textContent = file.name;
  } else {
    base64data = '';
    imgPreview.src = '';
    imgPreview.style.display = 'none';
    fileNameEl.textContent = 'No file chosen';
  }
});

promptEl.addEventListener('input', () => {
  movieIdea = promptEl.value;
});

openKeyEl.addEventListener('click', async () => {
  await window.aistudio?.openSelectKey();
});

generateButton.addEventListener('click', () => {
  if (movieIdea.trim()) {
    generateMovie();
  } else {
    statusEl.innerText = 'Please enter a movie idea.';
  }
});
