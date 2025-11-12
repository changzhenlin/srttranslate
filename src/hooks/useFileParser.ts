import { useState } from 'react';
import { parseSRT, SubtitleLine } from '../utils/srtParser';

interface UseFileParserReturn {
  subtitles: SubtitleLine[];
  fileName: string;
  isParsing: boolean;
  error: string | null;
  parseFile: (file: File) => Promise<void>;
  clearSubtitles: () => void;
}

/**
 * 用于解析SRT文件的自定义Hook
 */
export const useFileParser = (): UseFileParserReturn => {
  const [subtitles, setSubtitles] = useState<SubtitleLine[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 解析SRT文件
   * @param file 要解析的文件
   */
  const parseFile = async (file: File): Promise<void> => {
    // 重置状态
    setError(null);
    setIsParsing(true);

    try {
      // 验证文件类型
      if (!file.name.endsWith('.srt')) {
        throw new Error('请上传SRT格式的字幕文件');
      }

      // 读取文件内容
      const content = await readFileContent(file);
      
      // 解析SRT内容
      const parsedSubtitles = parseSRT(content);
      
      // 验证解析结果
      if (parsedSubtitles.length === 0) {
        throw new Error('无法解析SRT文件，可能格式不正确');
      }

      // 更新状态
      setSubtitles(parsedSubtitles);
      setFileName(file.name);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '解析文件失败';
      setError(errorMessage);
      console.error('文件解析错误:', err);
    } finally {
      setIsParsing(false);
    }
  };

  /**
   * 读取文件内容
   * @param file 文件对象
   * @returns 文件内容
   */
  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          if (!content) {
            reject(new Error('文件内容为空'));
            return;
          }
          resolve(content);
        } catch (err) {
          reject(new Error('读取文件内容失败'));
        }
      };

      reader.onerror = () => {
        reject(new Error('读取文件失败'));
      };

      // 尝试使用UTF-8编码读取
      reader.readAsText(file, 'utf-8');
    });
  };

  /**
   * 清除字幕数据
   */
  const clearSubtitles = (): void => {
    setSubtitles([]);
    setFileName('');
    setError(null);
  };

  return {
    subtitles,
    fileName,
    isParsing,
    error,
    parseFile,
    clearSubtitles
  };
};
