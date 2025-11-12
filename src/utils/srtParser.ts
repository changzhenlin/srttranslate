// 主要的SubtitleLine接口
export interface SubtitleLine {
  id: number;
  startTime: string;
  endTime: string;
  text: string;
}

// 兼容其他可能使用的格式
interface AlternativeSubtitleLine {
  index: number;
  start: string;
  end: string;
  text: string;
}

/**
 * 解析SRT字幕文件内容 - 增强版
 * 支持多种SRT格式变体，具有更健壮的错误处理
 * @param srtContent SRT文件的文本内容
 * @returns 字幕行数组
 * @throws 当内容无法解析或格式严重错误时抛出异常
 */
/**
 * 检查字幕对象是否为主要格式
 */
function isMainSubtitleFormat(subtitle: any): subtitle is SubtitleLine {
  return 'id' in subtitle && 'startTime' in subtitle && 'endTime' in subtitle;
}

/**
 * 检查字幕对象是否为替代格式
 */
function isAlternativeSubtitleFormat(subtitle: any): subtitle is AlternativeSubtitleLine {
  return 'index' in subtitle && 'start' in subtitle && 'end' in subtitle;
}

/**
 * 解析SRT字幕文件内容 - 增强版
 */
export const parseSRT = (srtContent: string): SubtitleLine[] => {
  // 检查内容是否为空
  if (!srtContent || srtContent.trim() === '') {
    throw new Error('SRT内容为空');
  }

  // 标准化换行符并去除BOM
  const normalizedContent = srtContent
    .replace(/\r\n|\r/g, '\n')
    .replace(/^\uFEFF/, ''); // 移除BOM标记

  const subtitles: SubtitleLine[] = [];
  
  // 使用正则表达式匹配字幕块
  // 支持标准格式和可能的变体
  const blockRegex = /\n?([0-9]+)\n([\d:,]+\s*-->\s*[\d:,]+[\s\S]*?)(?=\n\n|\n\d+\n|$)/g;
  let match;
  let validBlocksFound = 0;

  while ((match = blockRegex.exec(normalizedContent)) !== null) {
    try {
      const id = parseInt(match[1], 10);
      const blockContent = match[2].trim();
      
      // 分割时间行和文本内容
      const firstNewlineIndex = blockContent.indexOf('\n');
      if (firstNewlineIndex === -1) {
        continue; // 无效块，缺少文本内容
      }
      
      const timeLine = blockContent.substring(0, firstNewlineIndex).trim();
      const text = blockContent.substring(firstNewlineIndex + 1).trim();
      
      // 解析时间戳，支持多种格式
      const timeRegex = /^([\d:,]+)\s*-->\s*([\d:,]+)/;
      const timeMatch = timeRegex.exec(timeLine);
      
      if (timeMatch && !isNaN(id)) {
        const startTime = timeMatch[1].trim();
        const endTime = timeMatch[2].trim();
        
        // 验证时间格式是否基本有效
        if (isValidTimeFormat(startTime) && isValidTimeFormat(endTime)) {
          subtitles.push({
            id,
            startTime,
            endTime,
            text
          });
          validBlocksFound++;
        }
      }
    } catch (error) {
      console.warn('解析字幕块时出错，跳过该块:', error);
      // 继续处理下一个块，不中断整个解析过程
    }
  }
  
  // 如果没有找到有效块，尝试使用备用解析方法
  if (validBlocksFound === 0) {
    const fallbackSubtitles = parseSRTFallback(normalizedContent);
    if (fallbackSubtitles.length > 0) {
      return fallbackSubtitles;
    }
    throw new Error('无法解析SRT文件，未找到有效的字幕块');
  }
  
  return subtitles;
};

/**
 * 备用SRT解析方法 - 基于空行分割
 * @param srtContent 标准化后的SRT内容
 * @returns 字幕行数组
 */
const parseSRTFallback = (srtContent: string): SubtitleLine[] => {
  const subtitles: SubtitleLine[] = [];
  const blocks = srtContent.split('\n\n').filter(block => block.trim() !== '');
  
  blocks.forEach((block, index) => {
    try {
      const lines = block.split('\n').filter(line => line.trim() !== '');
      
      // 寻找时间行
      let timeLineIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) {
          timeLineIndex = i;
          break;
        }
      }
      
      if (timeLineIndex >= 0 && timeLineIndex < lines.length - 1) {
        // 尝试从时间行之前的行获取ID，如果没有则使用索引
        const idLine = lines[timeLineIndex - 1] || `${index + 1}`;
        const id = !isNaN(parseInt(idLine, 10)) ? parseInt(idLine, 10) : index + 1;
        
        const timeMatch = lines[timeLineIndex].match(/^(.*?)\s*-->\s*(.*?)$/);
        
        if (timeMatch) {
          const startTime = timeMatch[1].trim();
          const endTime = timeMatch[2].trim();
          const text = lines.slice(timeLineIndex + 1).join('\n');
          
          subtitles.push({
            id,
            startTime,
            endTime,
            text
          });
        }
      }
    } catch (error) {
      console.warn('备用解析方法处理字幕块时出错:', error);
    }
  });
  
  return subtitles;
};

/**
 * 验证时间格式是否基本有效
 * @param timeStr 时间字符串
 * @returns 是否有效
 */
const isValidTimeFormat = (timeStr: string): boolean => {
  // 基本的时间格式验证，支持 HH:MM:SS,mmm 或 MM:SS,mmm
  const timeRegex = /^(\d{1,2}:)?\d{1,2}:\d{1,2}[.,]\d{1,3}$/;
  return timeRegex.test(timeStr);
};

/**
 * 将字幕数组转换回SRT格式文本
 * @param subtitles 字幕行数组
 * @returns SRT格式的文本内容
 */
export const generateSRT = (subtitles: SubtitleLine[]): string => {
  if (!subtitles || subtitles.length === 0) {
    return '';
  }
  
  // 确保ID是连续的
  const normalizedSubtitles = subtitles.map((sub, index) => ({
    ...sub,
    id: index + 1
  }));
  
  return normalizedSubtitles.map(sub => {
    return `${sub.id}\n${sub.startTime} --> ${sub.endTime}\n${sub.text}`;
  }).join('\n\n');
};

/**
 * 导出SRT内容 - 兼容多种字幕格式
 * 支持主要格式(SubtitleLine)和替代格式(AlternativeSubtitleLine)
 */
export const exportSrtContent = (subtitles: any[]): string => {
  if (!subtitles || subtitles.length === 0) {
    return '';
  }
  
  // 转换不同格式的字幕到标准SRT格式字符串
  return subtitles
    .map((subtitle, index) => {
      let id = index + 1;
      let startTime = '';
      let endTime = '';
      let text = subtitle.text || '';
      
      // 根据不同格式提取时间信息
      if (isMainSubtitleFormat(subtitle)) {
        startTime = subtitle.startTime;
        endTime = subtitle.endTime;
      } else if (isAlternativeSubtitleFormat(subtitle)) {
        startTime = subtitle.start;
        endTime = subtitle.end;
        if (subtitle.index) {
          id = subtitle.index;
        }
      } else {
        // 尝试提取时间信息，支持其他可能的格式
        startTime = subtitle.startTime || subtitle.start || '';
        endTime = subtitle.endTime || subtitle.end || '';
      }
      
      // 确保时间信息有效
      if (!startTime || !endTime) {
        console.warn(`字幕 ${id} 缺少有效时间信息，已跳过`);
        return null;
      }
      
      return `${id}\n${startTime} --> ${endTime}\n${text}`;
    })
    .filter(Boolean) // 过滤掉无效的字幕块
    .join('\n\n');
};

/**
 * 创建下载链接并触发下载
 * @param content SRT文件内容
 * @param filename 可选的文件名，默认会生成包含时间戳的文件名
 */
export const downloadSrtFile = (content: string, filename?: string): void => {
  if (!content) {
    throw new Error('没有可下载的内容');
  }
  
  // 生成文件名
  const defaultFilename = `translated_${new Date().toISOString().replace(/[:.]/g, '-')}.srt`;
  const finalFilename = filename || defaultFilename;
  
  try {
    // 创建Blob对象，确保使用UTF-8编码
    const blob = new Blob([content], { type: 'text/srt;charset=utf-8' });
    
    // 创建下载链接
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // 设置下载属性
    link.href = url;
    link.download = finalFilename;
    
    // 处理Safari等不支持直接点击的浏览器
    link.style.display = 'none';
    document.body.appendChild(link);
    
    // 触发下载
    link.click();
    
    // 清理
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
    
    console.log(`SRT文件已下载: ${finalFilename}`);
  } catch (error) {
    console.error('下载SRT文件时出错:', error);
    throw new Error('下载失败，请重试');
  }
};;
