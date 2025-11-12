import { useState, useCallback, useRef } from 'react';
import { translationService } from '../services/translationService';
import type { SubtitleLine } from '../utils/srtParser';

interface UseTranslationReturn {
  isTranslating: boolean;
  translateSubtitles: (subtitles: SubtitleLine[], targetLanguage: string) => Promise<void>;
  cancelTranslation: () => void;
  translationProgress: {
    completed: number;
    total: number;
  };
}

/**
 * 字幕翻译管理的自定义Hook
 */
export const useTranslation = (onTranslated?: (translatedSubtitles: SubtitleLine[]) => void): UseTranslationReturn => {
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [translationProgress, setTranslationProgress] = useState({
    completed: 0,
    total: 0
  });
  const isCancelledRef = useRef<boolean>(false);
  const translationCacheRef = useRef<Map<string, string>>(new Map());
  // 用于跟踪活动的翻译Promise，防止内存泄漏
  const activePromisesRef = useRef<Set<Promise<string>>>(new Set());
  const progressRef = useRef({ completed: 0, total: 0 });

  /**
   * 取消翻译操作
   */
  const cancelTranslation = useCallback(() => {
    isCancelledRef.current = true;
    setIsTranslating(false);
    setTranslationProgress({ completed: 0, total: 0 });
    progressRef.current = { completed: 0, total: 0 };
    // 清空活跃的Promise集合，但不取消正在进行的请求
    activePromisesRef.current.clear();
  }, []);

  /**
   * 翻译字幕列表
   * @param subtitles 待翻译的字幕列表
   * @param targetLanguage 目标语言
   */
  const translateSubtitles = useCallback(async (
    subtitles: SubtitleLine[],
    targetLanguage: string
  ): Promise<void> => {
    if (!subtitles.length) return;
    
    // 重置状态
    setIsTranslating(true);
    isCancelledRef.current = false;
    activePromisesRef.current.clear();
    
    // 重置进度
    const total = subtitles.length;
    setTranslationProgress({ completed: 0, total });
    progressRef.current = { completed: 0, total };

    const translatedSubtitles: SubtitleLine[] = [...subtitles];
    const maxConcurrent = 5;
    
    // 统计性能指标
    const startTime = performance.now();
    const cacheStats = { hits: 0, total: 0 };
    
    // 并发翻译函数
    const translateBatch = async (index: number, text: string) => {
      if (isCancelledRef.current) return;

      // 检查缓存
      const cacheKey = `${text}_${targetLanguage}`;
      if (translationCacheRef.current.has(cacheKey)) {
        translatedSubtitles[index].text = translationCacheRef.current.get(cacheKey)!;
        cacheStats.hits++;
        cacheStats.total++;
        
        // 更新进度
        const newCompleted = ++progressRef.current.completed;
        setTranslationProgress({ completed: newCompleted, total: progressRef.current.total });
        return;
      }
      
      cacheStats.total++;

      try {
          const translatePromise = translationService.translate({
            sourceLanguage: 'ja',
            targetLanguage: 'zh',
            text: text
          });
          activePromisesRef.current.add(translatePromise);
          
          const translated = await translatePromise;
          activePromisesRef.current.delete(translatePromise);
          
          if (isCancelledRef.current) return;

          translatedSubtitles[index].text = translated;
          translationCacheRef.current.set(cacheKey, translated);
          
          // 更新进度
          const newCompleted = ++progressRef.current.completed;
          setTranslationProgress({ completed: newCompleted, total: progressRef.current.total });
        } catch (error) {
          console.error(`翻译失败 (索引 ${index}):`, error);
          // 翻译失败时保留原文
          translatedSubtitles[index].text = text;
        }
    };

    // 使用更高效的并发控制方式
    const batchSize = maxConcurrent;
    for (let i = 0; i < subtitles.length; i += batchSize) {
      if (isCancelledRef.current) break;

      const batch = subtitles.slice(i, i + batchSize);
      const batchPromises = batch.map((subtitle, batchIndex) => 
        translateBatch(i + batchIndex, subtitle.text)
      );
      
      // 等待当前批次完成
      await Promise.all(batchPromises);
    }

    if (!isCancelledRef.current) {
      const endTime = performance.now();
      const cacheHitRate = cacheStats.total > 0 ? (cacheStats.hits / cacheStats.total * 100) : 0;
      console.log(`翻译完成: ${subtitles.length}条字幕, 耗时: ${(endTime - startTime).toFixed(2)}ms`);
      console.log(`缓存命中率: ${cacheHitRate.toFixed(2)}% (命中: ${cacheStats.hits}, 未命中: ${cacheStats.total - cacheStats.hits})`);
      
      setIsTranslating(false);
      onTranslated?.(translatedSubtitles);
    }
  }, [onTranslated]);

  return {
    isTranslating,
    translateSubtitles,
    cancelTranslation,
    translationProgress
  };
};
