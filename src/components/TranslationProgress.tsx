import React from 'react';

interface TranslationProgressProps {
  total: number;
  completed: number;
  isTranslating: boolean;
  error?: string;
}

const TranslationProgress: React.FC<TranslationProgressProps> = ({
  total,
  completed,
  isTranslating,
  error
}) => {
  const progress = total > 0 ? (completed / total) * 100 : 0;

  if (!isTranslating && completed === 0) {
    return null;
  }

  return (
    <div className="translation-progress">
      <div className="progress-header">
        <h3>翻译进度</h3>
        {isTranslating && (
          <span className="status-text">正在翻译...</span>
        )}
        {!isTranslating && completed > 0 && !error && (
          <span className="status-text success">翻译完成!</span>
        )}
        {error && (
          <span className="status-text error">翻译失败: {error}</span>
        )}
      </div>
      
      <div className="progress-bar-container">
        <div 
          className="progress-bar-fill"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
      
      <div className="progress-stats">
        {completed}/{total} 行已翻译
      </div>
    </div>
  );
};

export default TranslationProgress;
