package org.example.aicode.aiservice;

import dev.langchain4j.rag.content.retriever.ContentRetriever;
import dev.langchain4j.service.MemoryId;
import dev.langchain4j.service.SystemMessage;
import dev.langchain4j.service.UserMessage;
import dev.langchain4j.service.spring.AiService;
import dev.langchain4j.service.spring.AiServiceWiringMode;
import reactor.core.publisher.Flux;

@AiService(
        wiringMode = AiServiceWiringMode.EXPLICIT,
        chatModel = "openAiChatModel",
        streamingChatModel= "openAiStreamingChatModel",
        chatMemoryProvider = "chatMemoryProvider",
        contentRetriever = "contentRetriever"

)
public interface Aiservice {

    @SystemMessage("你是一个聊天机器人，协助用户解答问题，提供信息，并让你的语言尽量有趣")
    Flux<String> chat(@UserMessage String messages, @MemoryId String memoryId);
}
