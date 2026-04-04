package org.example.aicode.aiservice;

import dev.langchain4j.service.MemoryId;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.spring.AiService;
import dev.langchain4j.service.spring.AiServiceWiringMode;
import reactor.core.publisher.Flux;

@AiService(
        wiringMode = AiServiceWiringMode.EXPLICIT,
        chatModel = "openAiChatModel",
        streamingChatModel= "openAiStreamingChatModel",
        chatMemoryProvider = "chatMemoryProvider"

)
public interface Aiservice {

    Flux<String> chat(@UserMessage String messages, @MemoryId String memoryId);
}
