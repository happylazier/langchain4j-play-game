package org.example.aicode.controller;

import org.example.aicode.aiservice.Aiservice;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Flux;

@RestController
public class ChatController {
    @Autowired
    private Aiservice aiservice;

    @PostMapping(value = "/chat",produces = "text/html;charset=utf-8")
    public Flux<String> chat(@RequestParam("messages") String messages,@RequestParam(value = "id",defaultValue = "Default")String memoryId){
        Flux<String>result = aiservice.chat(messages,memoryId);
        return result;
    }

}
