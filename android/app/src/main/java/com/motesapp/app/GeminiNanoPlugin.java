package com.motesapp.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// ML Kit GenAI (Gemini Nano) Imports
import com.google.mlkit.genai.summarization.Summarization;
import com.google.mlkit.genai.summarization.Summarizer;
import com.google.mlkit.genai.summarization.SummarizerOptions;
import com.google.mlkit.genai.summarization.SummarizationRequest;
import com.google.mlkit.genai.summarization.SummarizationResult;

import com.google.common.util.concurrent.FutureCallback;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;

@CapacitorPlugin(name = "GeminiNano")
public class GeminiNanoPlugin extends Plugin {

    @PluginMethod
    public void generateText(PluginCall call) {
        String prompt = call.getString("prompt", "");

        try {
            // 1. Skapa options (Här skickar vi med context för att initiera AICore)
            SummarizerOptions options = SummarizerOptions.builder(getContext()).build();

            Summarizer summarizer = Summarization.getClient(options);

            // 2. FIX: Skicka in prompten DIREKT i builder-metoden.
            // Inget "new", och inga tomma parenteser.
            SummarizationRequest request = SummarizationRequest.builder(prompt).build();

            // 3. Kör sammanfattningen via din Pixel 9 Pro's lokala AI
            ListenableFuture<SummarizationResult> future = summarizer.runInference(request);

            Futures.addCallback(future, new FutureCallback<SummarizationResult>() {
                @Override
                public void onSuccess(SummarizationResult result) {
                    JSObject ret = new JSObject();
                    // Hämta den genererade texten
                    ret.put("text", result.getSummary());
                    call.resolve(ret);
                }

                @Override
                public void onFailure(Throwable t) {
                    // Om du får Error 8 här, se lösningen nedan
                    call.reject("Nano-fel (Error 8): " + t.getMessage());
                }
            }, getContext().getMainExecutor());

        } catch (Exception e) {
            call.reject("Kunde inte starta den lokala motorn: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getRealPath(PluginCall call) {
        String uri = call.getString("uri");
        JSObject ret = new JSObject();
        ret.put("path", uri);
        call.resolve(ret);
    }
}
