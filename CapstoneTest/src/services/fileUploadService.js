// 🔹 Upload Leave Request Proof (Leave Feature) – UNTOUCHED
export async function uploadFileToAppScript(file) {
  const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx391rU35YSL9j6qU99wcH8bUwIvOvtFJuCcGTw1tuJjsWMQNBAKFfT5qyIZGPyPTbH2A/exec";
  const MAX_TIMEOUT_MS = 30_000; // 30s

  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error('Upload timeout')), MAX_TIMEOUT_MS);

    reader.onloadend = async () => {
      clearTimeout(timeoutId);
      try {
        const base64Data = reader.result.split(",")[1];

        // Post JSON with filename and mimeType to make Apps Script parsing more robust
        const payload = JSON.stringify({ fileName: file.name, mimeType: file.type, data: base64Data });

        const response = await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });

        // Apps Script sometimes returns an HTML wrapper containing JSON.
        const text = await response.text();
        let data = null;
        try {
          data = JSON.parse(text);
        } catch (err) {
          const m = text.match(/\{[\s\S]*\}/);
          if (m && m[0]) {
            try {
              data = JSON.parse(m[0]);
            } catch (err2) {
              return reject(new Error('Failed to parse Apps Script response'));
            }
          } else {
            return reject(new Error('No JSON found in Apps Script response'));
          }
        }

        // Normalize known fields
        const result = {
          url: data.url || data.fileUrl || data.previewUrl || data.viewUrl || data.link || null,
          previewUrl: data.previewUrl || data.url || data.viewUrl || null,
          raw: data
        };
        resolve(result);
      } catch (err) {
        reject(new Error('Upload failed: ' + (err && err.message ? err.message : String(err))));
      }
    };

    reader.onerror = () => {
      clearTimeout(timeoutId);
      reject(new Error('Failed to read file for upload'));
    };

    reader.readAsDataURL(file);
  });
}

