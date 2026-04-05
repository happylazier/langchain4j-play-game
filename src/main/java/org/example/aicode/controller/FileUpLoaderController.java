package org.example.aicode.controller;

import dev.langchain4j.data.document.Document;
import dev.langchain4j.data.document.loader.FileSystemDocumentLoader;
import dev.langchain4j.data.document.parser.apache.tika.ApacheTikaDocumentParser;
import org.example.aicode.config.LLMconfig;
import org.example.aicode.pojo.Result;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

@RestController
public class FileUpLoaderController {

    // 限制上传文件大小为 10MB
    @PostMapping("/upload")
    public Result uploadFile(@RequestParam("file") MultipartFile file) throws IOException {
        if (file.isEmpty()) {
            throw new RuntimeException("上传文件不能为空");
        }
        System.out.println("文件开始上传");
        Path tempFile = Files.createTempFile("upload_", "_" + file.getOriginalFilename());
        // 2. 将上传的文件内容复制到临时文件
        file.transferTo(tempFile.toFile());

        // 3. 使用 FileSystemDocumentLoader 加载这个临时文件
        // 使用 ApacheTikaDocumentParser 自动识别格式
        Document document = FileSystemDocumentLoader.loadDocument(
                tempFile,
                new ApacheTikaDocumentParser()
        );
        List<Document> documents = List.of(document);
        LLMconfig.ingestor.ingest(documents);
        // 4. 清理临时文件
        Files.deleteIfExists(tempFile);
        System.out.println("文件上传成功");
        // 5. 返回包含单个 Document 的列表，或转为 List<Document>
        return Result.success();

    }
}
