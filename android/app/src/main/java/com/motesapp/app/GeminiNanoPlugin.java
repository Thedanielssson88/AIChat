package com.motesapp.app;

import android.content.ContentUris;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.google.ai.client.generativeai.GenerativeModel;
// GenerationConfig borttagen för att lösa kompilatorfelet
import com.google.ai.client.generativeai.java.GenerativeModelFutures;
import com.google.common.util.concurrent.FutureCallback;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;

@CapacitorPlugin(name = "GeminiNano")
public class GeminiNanoPlugin extends Plugin {

    @PluginMethod
    public void generateText(PluginCall call) {
        String systemPrompt = call.getString("systemPrompt", "");
        String prompt = call.getString("prompt", "");

        try {
            // FIX: Vi skippar GenerationConfig och använder modellens standardinställningar
            // "dummy-key" används eftersom lokala modeller inte behöver en riktig nyckel
            GenerativeModel gm = new GenerativeModel("gemini-nano", "dummy-key");
            GenerativeModelFutures model = GenerativeModelFutures.from(gm);

            String fullPrompt = systemPrompt + "\n\n" + prompt;

            ListenableFuture<com.google.ai.client.generativeai.type.GenerateContentResponse> responseFuture =
                model.generateContent(new com.google.ai.client.generativeai.type.Content.Builder()
                    .addText(fullPrompt)
                    .build());

            Futures.addCallback(responseFuture, new FutureCallback<com.google.ai.client.generativeai.type.GenerateContentResponse>() {
                @Override
                public void onSuccess(com.google.ai.client.generativeai.type.GenerateContentResponse result) {
                    JSObject ret = new JSObject();
                    ret.put("text", result.getText());
                    call.resolve(ret);
                }

                @Override
                public void onFailure(Throwable t) {
                    call.reject("Nano-fel: " + t.getMessage());
                }
            }, getContext().getMainExecutor());

        } catch (Exception e) {
            call.reject("Kunde inte starta AICore: " + e.getMessage());
        }
    }

    // NY METOD: Fixar content:// URI -> /storage/ sökväg för din Llama-fil
    @PluginMethod
    public void getRealPath(PluginCall call) {
        String uriString = call.getString("uri");
        if (uriString == null) {
            call.reject("Ingen URI");
            return;
        }

        try {
            Uri uri = Uri.parse(uriString);
            String path = null;

            if (DocumentsContract.isDocumentUri(getContext(), uri)) {
                String docId = DocumentsContract.getDocumentId(uri);
                if (docId.startsWith("raw:")) {
                    path = docId.replaceFirst("raw:", "");
                } else {
                    String[] split = docId.split(":");
                    if ("primary".equalsIgnoreCase(split[0])) {
                        path = Environment.getExternalStorageDirectory() + "/" + split[1];
                    }
                }
            }

            if (path == null) path = uri.getPath();

            JSObject ret = new JSObject();
            ret.put("path", path);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Kunde inte översätta sökväg: " + e.getMessage());
        }
    }
}
