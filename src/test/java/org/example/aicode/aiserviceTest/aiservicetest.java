package org.example.aicode.aiserviceTest;

import org.example.aicode.aiservice.Aiservice;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import reactor.core.publisher.Flux;
@SpringBootTest
public class aiservicetest {
    @Autowired
    private Aiservice aiservice;


    @Test
    public void chat(){
        aiservice.chat("nihao","aaa");
    }
}
