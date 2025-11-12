export interface TranslationOptions {
  sourceLanguage: string;
  targetLanguage: string;
  text: string;
}

// LRU缓存实现
class LRUCache {
  private cache: Map<string, string>;
  private maxSize: number;
  private keys: string[];

  constructor(maxSize: number = 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.keys = [];
  }

  private getKey(sourceLang: string, targetLang: string, text: string): string {
    return `${sourceLang}_${targetLang}_${text}`;
  }

  get(sourceLang: string, targetLang: string, text: string): string | undefined {
    const key = this.getKey(sourceLang, targetLang, text);
    const value = this.cache.get(key);
    
    if (value) {
      // 移动到最前面（最近使用）
      this.keys = this.keys.filter(k => k !== key);
      this.keys.unshift(key);
    }
    
    return value;
  }

  set(sourceLang: string, targetLang: string, text: string, translatedText: string): void {
    const key = this.getKey(sourceLang, targetLang, text);
    
    // 如果已存在，先移除
    if (this.cache.has(key)) {
      this.keys = this.keys.filter(k => k !== key);
    } 
    // 如果超出大小限制，移除最久未使用的
    else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.keys.pop();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    
    // 添加新键值对并标记为最近使用
    this.cache.set(key, translatedText);
    this.keys.unshift(key);
  }

  clear(): void {
    this.cache.clear();
    this.keys = [];
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * 翻译服务接口
 */
export class TranslationService {
  private resultCache: LRUCache;
  private promiseCache: Map<string, Promise<string>>;
  private maxConcurrent = 40; // 进一步提高最大并发数以大幅提升翻译速度
  private activeTranslations = 0;
  private translationQueue: { 
    options: TranslationOptions; 
    resolve: (text: string) => void; 
    reject: (error: any) => void 
  }[] = [];
  private isProcessing = false;

  constructor() {
    this.resultCache = new LRUCache();
    this.promiseCache = new Map();
  }

  /**
   * 翻译文本
   * @param options 翻译选项
   * @returns 翻译后的文本
   */
  async translate(options: TranslationOptions): Promise<string> {
    const { sourceLanguage, targetLanguage, text } = options;
    
    // 强制使用日语到中文的翻译
    if (sourceLanguage !== 'ja' || targetLanguage !== 'zh') {
      throw new Error('只支持日语到中文的翻译');
    }
    
    // 空文本处理
    if (!text.trim()) {
      return text;
    }
    
    // 检查结果缓存（已完成的翻译）
    const cachedResult = this.resultCache.get(sourceLanguage, targetLanguage, text);
    if (cachedResult) {
      return cachedResult;
    }

    // 检查Promise缓存（正在进行的翻译）
    const cacheKey = `${sourceLanguage}_${targetLanguage}_${text}`;
    if (this.promiseCache.has(cacheKey)) {
      return this.promiseCache.get(cacheKey)!;
    }

    // 创建翻译Promise
    const translationPromise = new Promise<string>((resolve, reject) => {
      this.translationQueue.push({ options, resolve, reject });
    });

    // 存入Promise缓存
    this.promiseCache.set(cacheKey, translationPromise);

    // 开始处理队列
    this.startProcessingQueue();

    try {
      const translatedText = await translationPromise;
      // 存入结果缓存
      this.resultCache.set(sourceLanguage, targetLanguage, text, translatedText);
      return translatedText;
    } finally {
      // 无论成功失败都从Promise缓存中移除
      this.promiseCache.delete(cacheKey);
    }
  }

  /**
   * 批量翻译文本
   * @param texts 待翻译的文本数组
   * @param sourceLanguage 源语言（必须是ja）
   * @param targetLanguage 目标语言（必须是zh）
   * @returns 翻译后的文本数组
   */
  async translateBatch(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<string[]> {
    // 强制使用日语到中文的翻译
    if (sourceLanguage !== 'ja' || targetLanguage !== 'zh') {
      throw new Error('只支持日语到中文的翻译');
    }
    
    // 基础批处理大小
    const baseBatchSize = 50;
    // 单个请求最大字符数（避免API限制）
    const maxCharsPerBatch = 10000;
    
    const results: string[] = new Array(texts.length);
    const tasks: { index: number; text: string; length: number }[] = [];

    // 首先检查缓存并收集需要翻译的任务
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const cachedResult = this.resultCache.get(sourceLanguage, targetLanguage, text);
      
      if (cachedResult) {
        results[i] = cachedResult;
      } else {
        // 记录文本长度用于后续动态批处理
        tasks.push({ index: i, text, length: text.length });
      }
    }
    
    // 根据文本总长度和任务数量动态调整批处理大小
    const totalChars = tasks.reduce((sum, task) => sum + task.length, 0);
    // 计算基于文本长度的动态批处理大小
    // 文本越多或越长，批处理大小越小，以避免单个批次过大
    const dynamicBatchSize = Math.max(
      10, // 最小批处理大小
      Math.min(
        baseBatchSize,
        Math.floor(Math.sqrt(texts.length) * 5), // 基于任务数量的动态调整
        Math.floor(maxCharsPerBatch / Math.max(1, totalChars / tasks.length || 1)) // 基于平均文本长度的调整
      )
    );

    // 按批次处理未缓存的文本
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      
      const batchPromises = batch.map(task => 
        this.translate({
          sourceLanguage,
          targetLanguage,
          text: task.text
        }).then(translatedText => ({
          index: task.index,
          text: translatedText
        }))
      );
      
      // 等待当前批次完成并填充结果
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(result => {
        results[result.index] = result.text;
      });
    }

    return results;
  }

  /**
   * 启动队列处理（非递归实现，避免栈溢出）
   */
  private startProcessingQueue(): void {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    this.processQueueIterative();
  }

  /**
   * 迭代方式处理翻译队列
   */
  private async processQueueIterative(): Promise<void> {
    while (this.translationQueue.length > 0 && this.activeTranslations < this.maxConcurrent) {
      const task = this.translationQueue.shift();
      if (!task) continue;

      this.activeTranslations++;

      // 立即处理下一个任务，而不是等待当前任务完成
      this.executeTranslationTask(task);
    }

    // 更新处理状态
    this.isProcessing = this.translationQueue.length > 0 || this.activeTranslations > 0;
  }

  /**
   * 执行单个翻译任务
   */
  private async executeTranslationTask(task: {
    options: TranslationOptions;
    resolve: (text: string) => void;
    reject: (error: any) => void;
  }): Promise<void> {
    try {
      // 添加重试逻辑
      let attempts = 0;
      const maxAttempts = 2;
      let lastError: any = null;

      while (attempts <= maxAttempts) {
        try {
          const translatedText = await this.translateWithGoogleAPI(task.options);
          task.resolve(translatedText);
          return;
        } catch (error) {
          lastError = error;
          attempts++;
            
            // 减少重试等待时间，加快重试速度
            if (attempts <= maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 300 * attempts));
            }
        }
      }

      // 所有尝试都失败
      throw lastError || new Error('翻译失败，已达到最大重试次数');
    } catch (error) {
      console.error('Translation failed:', error);
      task.reject(error);
    } finally {
      this.activeTranslations--;
      // 继续处理队列中的下一个任务
      this.processQueueIterative();
    }
  }

  /**
   * 使用Google Translate官方API进行翻译
   * 只支持日语到中文的翻译
   */
  /**
   * 使用Google Translate官方API进行翻译
   * 通过Vite代理解决跨域问题
   * 只支持日语到中文的翻译
   */
  private async translateWithGoogleAPI(options: TranslationOptions): Promise<string> {
    const { sourceLanguage, targetLanguage, text } = options;
    
    // 确保使用日语到中文的翻译
    if (sourceLanguage !== 'ja' || targetLanguage !== 'zh') {
      throw new Error('只支持日语到中文的翻译');
    }
    
    // 直接调用Google Translate API
    const params = new URLSearchParams({
      client: 'gtx',
      sl: sourceLanguage,
      tl: targetLanguage,
      dt: 't',
      q: text
    });
    
    const requestUrl = `https://translate.googleapis.com/translate_a/single?${params}`;
    
    // 调整超时时间为更合理的值
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8秒超时
    
    try {
      // 使用keepalive和no-cache策略优化连接重用和响应速度
      const response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal,
        keepalive: true
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // 解析Google Translate API响应
      // 正常响应格式应该是一个嵌套数组，翻译结果在[0][0][0]位置
      if (data && Array.isArray(data) && data.length > 0 && 
          Array.isArray(data[0]) && data[0].length > 0 && 
          Array.isArray(data[0][0]) && data[0][0].length > 0) {
        return data[0][0][0];
      }
      
      throw new Error('Invalid translation response format');
    } catch (error) {
      // 简化错误处理，减少日志开销
      const typedError = error as Error;
      if (typedError.name === 'AbortError') {
        throw new Error('Translation request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.resultCache.clear();
    // 不清除正在进行的Promise缓存，避免影响正在进行的翻译
  }

  /**
   * 设置最大并发数
   */
  setMaxConcurrent(concurrent: number): void {
    this.maxConcurrent = Math.max(1, Math.min(50, concurrent)); // 进一步放宽限制到1-50之间
    this.startProcessingQueue();
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.resultCache.size,
      maxSize: 1000 // 从LRUCache的构造函数获取
    };
  }

  /**
   * 获取当前队列状态
   */
  getQueueStatus(): { 
    queued: number; 
    active: number;
    maxConcurrent: number;
    isProcessing: boolean;
  } {
    return {
      queued: this.translationQueue.length,
      active: this.activeTranslations,
      maxConcurrent: this.maxConcurrent,
      isProcessing: this.isProcessing
    };
  }
}

// 创建单例实例
export const translationService = new TranslationService();
