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
    // 使用动态批处理大小进行优化
    for (let i = 0; i < tasks.length; i += dynamicBatchSize) {
      // 获取当前批次
      const batch = tasks.slice(i, i + dynamicBatchSize);
      
      // 计算当前批次的字符总数
      const batchCharCount = batch.reduce((sum, task) => sum + task.length, 0);
      
      // 如果单个批次过大，可以进一步拆分（虽然已经通过dynamicBatchSize控制，但增加额外保障）
      let effectiveBatchSize = dynamicBatchSize;
      if (batchCharCount > maxCharsPerBatch) {
        effectiveBatchSize = Math.floor(dynamicBatchSize * maxCharsPerBatch / batchCharCount);
        effectiveBatchSize = Math.max(1, effectiveBatchSize); // 确保至少为1
      }
      
      // 按实际有效的批次大小处理
      const actualBatch = batch.slice(0, effectiveBatchSize);
      
      const batchPromises = actualBatch.map(task => 
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
      
      // 确保批处理期间不会超出API限制
      if (i + effectiveBatchSize < tasks.length) {
        // 如果不是最后一批，可以添加一个小延迟避免API请求过于密集
        await new Promise(resolve => setTimeout(resolve, 100));
      }
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
      // 改进的重试逻辑
      let attempts = 0;
      const maxAttempts = 3; // 增加最大尝试次数
      let lastError: any = null;
      
      // 智能退避策略
      const getRetryDelay = (attempt: number): number => {
        // 基础延迟 + 随机抖动
        const baseDelay = 300;
        const maxJitter = 200;
        // 指数退避，但增长速度适中
        return Math.min(baseDelay * Math.pow(1.5, attempt), 2000) + Math.random() * maxJitter;
      };
      
      // 记录特定错误类型的计数器
      const errorCounts = {
        timeout: 0,
        rateLimit: 0,
        serverError: 0
      };

      while (attempts <= maxAttempts) {
        try {
          const translatedText = await this.translateWithGoogleAPI(task.options);
          task.resolve(translatedText);
          return;
        } catch (error) {
          lastError = error;
          attempts++;
          
          // 错误类型分类和处理
          const typedError = error as Error;
          if (typedError.message?.includes('timeout')) {
            errorCounts.timeout++;
            console.warn(`翻译超时 (${errorCounts.timeout}次)，正在重试...`);
          } else if (typedError.message?.includes('429') || typedError.message?.includes('rate limit')) {
            errorCounts.rateLimit++;
            console.warn(`遇到速率限制 (${errorCounts.rateLimit}次)，增加延迟后重试...`);
            // 遇到速率限制时增加额外延迟
            if (attempts <= maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 2000 + getRetryDelay(attempts)));
              continue;
            }
          } else if (typedError.message?.includes('50')) {
            errorCounts.serverError++;
            console.warn(`服务器错误 (${errorCounts.serverError}次)，稍后重试...`);
          }
            
          // 根据错误类型和尝试次数调整重试策略
          if (attempts <= maxAttempts) {
            const delay = getRetryDelay(attempts);
            console.log(`翻译尝试失败 ${attempts}/${maxAttempts}，${delay.toFixed(0)}ms 后重试...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // 所有尝试都失败，创建更详细的错误信息
      const detailedError = new Error(
        `翻译失败，已达到最大重试次数 (${maxAttempts}次)。` +
        `\n错误统计：超时 ${errorCounts.timeout}次, 速率限制 ${errorCounts.rateLimit}次, 服务器错误 ${errorCounts.serverError}次` +
        (lastError ? `\n原始错误: ${lastError.message}` : '')
      );
      throw detailedError;
    } catch (error) {
      console.error('翻译任务执行失败:', {
        error: error instanceof Error ? error.message : String(error),
        source: task.options.sourceLanguage,
        target: task.options.targetLanguage,
        textLength: task.options.text.length
      });
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
   * 通过优化的请求配置提高稳定性和成功率
   * 只支持日语到中文的翻译
   */
  private async translateWithGoogleAPI(options: TranslationOptions): Promise<string> {
    const { sourceLanguage, targetLanguage, text } = options;
    
    // 确保使用日语到中文的翻译
    if (sourceLanguage !== 'ja' || targetLanguage !== 'zh') {
      throw new Error('只支持日语到中文的翻译');
    }
    
    // 文本预处理：移除多余空格和控制字符
    const processedText = text.trim().replace(/[\r\n]+/g, ' ');
    
    // 限制单个请求的文本长度，避免API拒绝
    const maxTextLength = 5000;
    if (processedText.length > maxTextLength) {
      console.warn(`文本长度 (${processedText.length}) 超过API限制，将被截断`);
      // 这里可以考虑实现自动分块，但目前简单截断
      throw new Error(`文本过长，请将其拆分为更短的段落 (当前: ${processedText.length}字符，限制: ${maxTextLength}字符)`);
    }
    
    // 构建优化的API参数
    const params = new URLSearchParams({
      client: 'gtx',
      sl: sourceLanguage,
      tl: targetLanguage,
      dt: 't',
      q: processedText,
      ie: 'UTF-8',  // 确保UTF-8编码
      oe: 'UTF-8'
    });
    
    const requestUrl = `https://translate.googleapis.com/translate_a/single?${params}`;
    
    // 智能超时设置：根据文本长度动态调整
    const baseTimeout = 5000; // 基础超时时间5秒
    const charTimeoutFactor = 2; // 每字符额外毫秒
    const calculatedTimeout = Math.min(baseTimeout + processedText.length * charTimeoutFactor, 15000); // 最大15秒
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), calculatedTimeout);
    
    // 请求配置优化
     const requestConfig = {
       method: 'GET',
       headers: {
         'Accept': 'application/json',
         'Content-Type': 'application/json',
         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
         'Cache-Control': 'no-store, max-age=0',
         'Pragma': 'no-cache',
         'Accept-Encoding': 'gzip, deflate, br',
         'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
       },
       signal: controller.signal,
       keepalive: true,
       credentials: 'omit' as RequestCredentials,
       referrerPolicy: 'no-referrer-when-downgrade' as ReferrerPolicy
     };
    
    try {
      console.debug(`发起翻译请求，文本长度: ${processedText.length}字符，超时设置: ${calculatedTimeout}ms`);
      const response = await fetch(requestUrl, requestConfig);
      
      // 增强的错误处理
      if (!response.ok) {
        const status = response.status;
        let errorMessage: string;
        
        switch (status) {
          case 429:
            errorMessage = '遇到API速率限制，请稍后再试';
            break;
          case 403:
            errorMessage = 'API访问被拒绝，可能是请求过于频繁';
            break;
          case 500:
          case 502:
          case 503:
          case 504:
            errorMessage = `服务器临时错误 (${status})，请稍后重试`;
            break;
          default:
            errorMessage = `HTTP错误! 状态码: ${status}`;
        }
        
        throw new Error(errorMessage);
      }
      
      // 增强的响应解析
      const data = await response.json();
      
      // 更健壮的响应格式检查和错误处理
      try {
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error('无效的API响应: 响应不是数组');
        }
        
        if (!Array.isArray(data[0]) || data[0].length === 0) {
          throw new Error('无效的API响应: 翻译结果数组为空');
        }
        
        // 确保翻译文本存在且不为空
        if (!Array.isArray(data[0][0]) || data[0][0].length === 0 || !data[0][0][0]) {
          // 对于空结果的容错处理
          console.warn('API返回空翻译结果，返回原文');
          return text;
        }
        
        const translatedText = data[0][0][0];
        
        // 验证翻译结果的有效性
        if (typeof translatedText !== 'string' || translatedText.trim() === '') {
          console.warn('翻译结果无效或为空，返回原文');
          return text;
        }
        
        console.debug('翻译成功，结果长度:', translatedText.length);
        return translatedText;
      } catch (parseError) {
        console.error('翻译响应解析失败:', parseError, '原始响应:', data);
        throw new Error(`翻译响应格式错误: ${parseError instanceof Error ? parseError.message : '未知错误'}`);
      }
    } catch (error) {
      // 增强的超时和网络错误处理
      const typedError = error as Error;
      
      if (typedError.name === 'AbortError') {
        throw new Error(`翻译请求超时 (${calculatedTimeout}ms)`);
      }
      
      // 网络错误处理
      if (typedError.message?.includes('Failed to fetch') || typedError.message?.includes('NetworkError')) {
        throw new Error('网络连接错误，请检查您的网络连接');
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
