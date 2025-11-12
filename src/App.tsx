import { useState, useEffect, useCallback } from 'react'
import './App.css'
import FileUpload from './components/FileUpload'
import SubtitleEditor from './components/SubtitleEditor'
import TranslationProgress from './components/TranslationProgress'
import { generateSRT, SubtitleLine, downloadSrtFile } from './utils/srtParser'
import { translationService } from './services/translationService'
import { useFileParser } from './hooks/useFileParser'
import { useTranslation } from './hooks/useTranslation'

function App() {
  // 使用自定义文件解析Hook
  const { 
    subtitles, 
    fileName, 
    parseFile 
  } = useFileParser();
  
  // 翻译相关状态
  const { 
    isTranslating, 
    translateSubtitles,
    cancelTranslation,
    translationProgress
  } = useTranslation();
  
  const [sourceLanguage, setSourceLanguage] = useState<string>('ja')
  const [targetLanguage, setTargetLanguage] = useState<string>('zh')
  // 新增：跟踪是否有翻译历史（即翻译是否完成过）
  const [translationCompleted, setTranslationCompleted] = useState<boolean>(false)

  // 处理文件上传 - 用于FileUpload组件
  const handleFileUpload = async (file: File) => {
    try {
      // 使用useFileParser提供的解析函数
      await parseFile(file);
    } catch (err) {
      // 错误处理已经在Hook内部完成
      console.error('解析文件失败:', err);
    }
  }

  // 处理字幕编辑 - 目前仅提供界面显示，实际更新逻辑已移至SubtitleEditor组件内部
  const handleSubtitleChange = (index: number, field: keyof SubtitleLine, value: any) => {
    // 注意：实际更新逻辑已由SubtitleEditor组件内部处理
    console.log(`更新字幕 ${index} 的 ${field} 字段为:`, value);
  }

  // 处理翻译
  const handleTranslate = async () => {
    if (subtitles.length === 0) {
      alert('请先上传字幕文件');
      return;
    }

    try {
      // 开始翻译前重置翻译完成状态
      setTranslationCompleted(false);
      await translateSubtitles(subtitles, targetLanguage);
      // 翻译成功完成后设置为true
      setTranslationCompleted(true);
    } catch (error) {
      console.error('翻译失败:', error);
      alert('翻译失败，请重试');
    }
  }

  // 取消翻译
  const handleCancelTranslation = () => {
    cancelTranslation();
  }

  // 刷新页面
  const handleRefresh = () => {
    window.location.reload();
  }

  // 翻译统计信息已移除，使用简单的提示

  // 组件卸载时取消正在进行的翻译
  useEffect(() => {
    return () => {
      if (isTranslating && typeof cancelTranslation === 'function') {
        cancelTranslation();
      }
    };
  }, [isTranslating, cancelTranslation]);

  // 监听翻译状态变化
  useEffect(() => {
    // 当翻译状态从true变为false且已完成的翻译数量大于0时，表示翻译已完成
    if (!isTranslating && translationProgress.completed > 0) {
      setTranslationCompleted(true);
      const cacheStats = translationService.getCacheStats();
      console.log(`翻译状态更新，缓存信息: ${cacheStats.size}/${cacheStats.maxSize}`);
    }
  }, [isTranslating, translationProgress.completed]);
  
  // 当上传新文件时重置翻译完成状态
  useEffect(() => {
    if (fileName) {
      setTranslationCompleted(false);
    }
  }, [fileName]);

  // 下载翻译结果
  const handleDownload = useCallback(() => {
    if (subtitles.length === 0) {
      alert('没有可下载的字幕')
      return
    }

    try {
      // 使用新的下载工具函数
      const srtContent = generateSRT(subtitles);
      const filename = `translated_${sourceLanguage}_to_${targetLanguage}_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.srt`;
      downloadSrtFile(srtContent, filename);
    } catch (err) {
      console.error('下载失败:', err);
      alert('下载失败');
    }
  }, [subtitles, sourceLanguage, targetLanguage]);

  return (
    <>
      <div className="container">
        
        <main className="main-content">
          <section className="upload-section animate-fade-in">
              <h2>上传文件</h2>
              <FileUpload onFileUpload={handleFileUpload} />
              {fileName && (
                <p className="file-name animate-slide-in">已上传: {fileName}</p>
              )}
            </section>

          <section className="language-section">
            <div className="language-selector">
              <select
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value)}
                disabled={true} // 始终禁用，因为我们只支持日语到中文的翻译
                className="language-select"
              >
                <option value="ja">日语</option>
              </select>
              <span className="language-arrow">→</span>
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                disabled={true} // 始终禁用，因为我们只支持日语到中文的翻译
                className="language-select"
              >
                <option value="zh">中文</option>
              </select>
            </div>
          </section>
          
          <section className="actions-section">
            <button
              className={`action-button translate-button ${isTranslating ? 'button-loading' : ''}`}
              onClick={handleTranslate}
              disabled={isTranslating || subtitles.length === 0}
            >
              <span className="button-text">{isTranslating ? '翻译中...' : '开始翻译'}</span>
              {isTranslating && (
                <span className="loading-spinner">⏳</span>
              )}
            </button>
            {isTranslating && (
              <button 
                onClick={handleCancelTranslation}
                className="action-button cancel-button"
              >
                取消翻译
              </button>
            )}
            {/* 只有在翻译完成后才显示下载按钮 */}
            {translationCompleted && (
              <button 
                onClick={handleDownload}
                disabled={subtitles.length === 0}
                className="action-button download-button animate-scale-in"
              >
                <span className="button-text">下载翻译结果</span>
                <span>↓</span>
              </button>
            )}
            {/* 刷新按钮 */}
            <button
              onClick={handleRefresh}
              className="action-button refresh-button"
              title="刷新页面"
            >
              <span className="button-text">刷新</span>
              <span>🔄</span>
            </button>
          </section>

            <TranslationProgress 
              total={translationProgress.total}
              completed={translationProgress.completed}
              isTranslating={isTranslating}
            />

            <section className="editor-section">
            <h2>字幕编辑</h2>
            <SubtitleEditor 
              subtitles={subtitles}
              onSubtitleChange={handleSubtitleChange}
            />
          </section>
        </main>
      </div>
    </>
  )
}

export default App