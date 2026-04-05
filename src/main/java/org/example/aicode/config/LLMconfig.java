package org.example.aicode.config;

import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.json.jackson.JacksonJsonpMapper;
import co.elastic.clients.transport.rest_client.RestClientTransport;
import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.DocumentSplitter;
import dev.langchain4j.data.document.loader.ClassPathDocumentLoader;
import dev.langchain4j.data.document.splitter.DocumentSplitters;
import dev.langchain4j.data.segment.TextSegment;
import dev.langchain4j.memory.ChatMemory;
import dev.langchain4j.memory.chat.ChatMemoryProvider;
import dev.langchain4j.memory.chat.MessageWindowChatMemory;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.rag.content.retriever.ContentRetriever;
import dev.langchain4j.rag.content.retriever.EmbeddingStoreContentRetriever;
import dev.langchain4j.store.embedding.EmbeddingStore;
import dev.langchain4j.store.embedding.EmbeddingStoreIngestor;
import dev.langchain4j.store.embedding.elasticsearch.ElasticsearchConfigurationKnn;
import dev.langchain4j.store.embedding.elasticsearch.ElasticsearchEmbeddingStore;
import dev.langchain4j.store.embedding.inmemory.InMemoryEmbeddingStore;
import lombok.val;
import org.apache.http.HttpHost;
import org.elasticsearch.client.RestClient;
import org.example.aicode.historyStore.AiChatMemoryStore;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.w3c.dom.Text;

import java.util.List;

@Configuration
public class LLMconfig {
    @Autowired
    private AiChatMemoryStore aiChatMemoryStore;
    @Autowired
    private EmbeddingModel embeddingModel;

    static public EmbeddingStoreIngestor ingestor = null;


    @Bean
    public ChatMemoryProvider chatMemoryProvider() {
        ChatMemoryProvider chatMemoryProvider= new ChatMemoryProvider() {
            @Override
            public ChatMemory get(Object memoryId) {
                return MessageWindowChatMemory.builder()
                        .id(memoryId)
                        .maxMessages(20)
                        .chatMemoryStore(aiChatMemoryStore)
                        .build();
            }
        };
        return chatMemoryProvider;
    }


    @Bean
    public ElasticsearchEmbeddingStore store() {
        RestClient restClient = RestClient.builder(
                new HttpHost("localhost", 9200, "http")
        ).build();
        //List<Document> documents = ClassPathDocumentLoader.loadDocuments("content");

        //构建文档分割器
        DocumentSplitter splitter = DocumentSplitters.recursive(200,30);
        ElasticsearchEmbeddingStore Store = ElasticsearchEmbeddingStore.builder()
                .restClient(restClient)// 使用上面配置的客户端
                .indexName("my_knowledge_base")// 你的 ES 索引名称，可以自定义
                .configuration(ElasticsearchConfigurationKnn.builder().build())// 使用 KNN 配置
                .build();

        ingestor = EmbeddingStoreIngestor.builder()
                .embeddingStore(Store)
                .documentSplitter(splitter)
                .embeddingModel(embeddingModel)
                .build();
        //ingestor.ingest(documents);
        return Store;
    }


    @Bean
    public ContentRetriever contentRetriever(ElasticsearchEmbeddingStore store) {
        return EmbeddingStoreContentRetriever.builder()
                .embeddingStore(store)
                .minScore(0.9)
                .maxResults(3)
                .embeddingModel(embeddingModel)
                .build();
    }
}
