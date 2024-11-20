import fs from 'fs-extra';
import path from 'path';

// Giới hạn token cho mỗi chunk
const MAX_TOKENS_PER_CHUNK = 2000;
const OVERLAP_TOKENS = 200; // Số token overlap giữa các chunk để duy trì context

// Ước tính số token từ text (rough estimation)
function estimateTokens(text) {
    // GPT typically counts tokens as ~4 characters
    return Math.ceil(text.length / 4);
}

// Tách văn bản thành các chunk với overlap
function splitIntoChunks(text) {
    const chunks = [];
    let currentChunk = '';
    let currentTokenCount = 0;
    
    // Tách theo đoạn văn để bảo toàn ngữ cảnh
    const paragraphs = text.split('\n\n');
    
    for (const paragraph of paragraphs) {
        const paragraphTokens = estimateTokens(paragraph);
        
        if (currentTokenCount + paragraphTokens <= MAX_TOKENS_PER_CHUNK) {
            // Thêm đoạn văn vào chunk hiện tại
            currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
            currentTokenCount += paragraphTokens;
        } else {
            // Lưu chunk hiện tại
            if (currentChunk) {
                chunks.push({
                    content: currentChunk,
                    tokenCount: currentTokenCount
                });
            }
            
            // Bắt đầu chunk mới
            currentChunk = paragraph;
            currentTokenCount = paragraphTokens;
        }
    }
    
    // Thêm chunk cuối cùng
    if (currentChunk) {
        chunks.push({
            content: currentChunk,
            tokenCount: currentTokenCount
        });
    }
    
    return chunks;
}

// Lưu metadata về token cho mỗi chunk
async function saveChunkMetadata(chunks, outputDir) {
    const metadata = {
        totalChunks: chunks.length,
        totalTokens: chunks.reduce((sum, chunk) => sum + chunk.tokenCount, 0),
        chunks: chunks.map((chunk, index) => ({
            index,
            tokenCount: chunk.tokenCount,
            firstWords: chunk.content.slice(0, 50) + '...'
        }))
    };
    
    await fs.writeJSON(path.join(outputDir, 'chunks-metadata.json'), metadata, { spaces: 2 });
    return metadata;
}

// Hàm chính để xử lý token management
export async function processContentWithTokens(content, outputDir) {
    try {
        // Tạo thư mục output nếu chưa tồn tại
        await fs.ensureDir(outputDir);
        
        // Tách content thành các chunk
        const chunks = splitIntoChunks(content);
        
        // Lưu từng chunk vào file riêng
        for (let i = 0; i < chunks.length; i++) {
            const chunkPath = path.join(outputDir, `chunk-${i}.txt`);
            await fs.writeFile(chunkPath, chunks[i].content);
        }
        
        // Lưu metadata
        const metadata = await saveChunkMetadata(chunks, outputDir);
        
        return {
            success: true,
            metadata,
            message: `Đã xử lý thành công ${chunks.length} chunks.`
        };
    } catch (error) {
        console.error('Lỗi khi xử lý token:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Hàm lấy chunk dựa trên context window
export async function getContextWindow(chunkIndex, numSurroundingChunks, outputDir) {
    try {
        const metadata = await fs.readJSON(path.join(outputDir, 'chunks-metadata.json'));
        const totalChunks = metadata.totalChunks;
        
        // Tính range của chunks cần lấy
        const start = Math.max(0, chunkIndex - numSurroundingChunks);
        const end = Math.min(totalChunks - 1, chunkIndex + numSurroundingChunks);
        
        let contextContent = '';
        for (let i = start; i <= end; i++) {
            const chunkPath = path.join(outputDir, `chunk-${i}.txt`);
            const chunkContent = await fs.readFile(chunkPath, 'utf-8');
            contextContent += (contextContent ? '\n\n' : '') + chunkContent;
        }
        
        return {
            success: true,
            content: contextContent,
            range: { start, end },
            estimatedTokens: estimateTokens(contextContent)
        };
    } catch (error) {
        console.error('Lỗi khi lấy context window:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Hàm theo dõi sử dụng token
export async function trackTokenUsage(outputDir, usage) {
    try {
        const usageFile = path.join(outputDir, 'token-usage.json');
        let currentUsage = { total: 0, history: [] };
        
        if (await fs.pathExists(usageFile)) {
            currentUsage = await fs.readJSON(usageFile);
        }
        
        // Thêm usage mới
        currentUsage.total += usage.tokens;
        currentUsage.history.push({
            timestamp: new Date().toISOString(),
            tokens: usage.tokens,
            action: usage.action
        });
        
        // Lưu usage
        await fs.writeJSON(usageFile, currentUsage, { spaces: 2 });
        
        return {
            success: true,
            currentUsage
        };
    } catch (error) {
        console.error('Lỗi khi theo dõi token usage:', error);
        return {
            success: false,
            error: error.message
        };
    }
}