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
        <h3>Translation Progress</h3>
        {isTranslating && (
          <span className="status-text">Translating...</span>
        )}
        {!isTranslating && completed > 0 && !error && (
          <span className="status-text success">Translation Complete!</span>
        )}
        {error && (
          <span className="status-text error">Translation Failed: {error}</span>
        )}
      </div>
      
      <div className="progress-bar-container">
        <div 
          className="progress-bar-fill"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
      
      <div className="progress-stats">
        {completed}/{total} lines translated
      </div>
    </div>
  );
};

export default TranslationProgress;
