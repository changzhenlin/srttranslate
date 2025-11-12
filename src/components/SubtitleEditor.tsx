import React from 'react';
import { SubtitleLine } from '../utils/srtParser';

interface SubtitleEditorProps {
  subtitles: SubtitleLine[];
  onSubtitleChange: (index: number, field: keyof SubtitleLine, value: any) => void;
}

const SubtitleEditor: React.FC<SubtitleEditorProps> = ({ subtitles, onSubtitleChange }) => {
  const handleTextChange = (index: number, event: React.ChangeEvent<HTMLTextAreaElement>) => {
    onSubtitleChange(index, 'text', event.target.value);
  };

  const handleTimeChange = (index: number, field: 'startTime' | 'endTime', event: React.ChangeEvent<HTMLInputElement>) => {
    onSubtitleChange(index, field, event.target.value);
  };

  if (subtitles.length === 0) {
    return (
      <div className="subtitle-editor-empty">
        请上传文件
      </div>
    );
  }

  return (
    <div className="subtitle-editor">
      <div className="editor-header">
        <div className="header-cell id-column">序号</div>
        <div className="header-cell time-column">开始时间</div>
        <div className="header-cell time-column">结束时间</div>
        <div className="header-cell text-column">字幕内容</div>
      </div>
      
      <div className="editor-body">
        {subtitles.map((subtitle, index) => (
          <div key={subtitle.id} className="subtitle-row">
            <div className="cell id-column">{subtitle.id}</div>
            <div className="cell time-column">
              <input
                type="text"
                value={subtitle.startTime}
                onChange={(e) => handleTimeChange(index, 'startTime', e)}
                className="time-input"
              />
            </div>
            <div className="cell time-column">
              <input
                type="text"
                value={subtitle.endTime}
                onChange={(e) => handleTimeChange(index, 'endTime', e)}
                className="time-input"
              />
            </div>
            <div className="cell text-column">
              <textarea
                value={subtitle.text}
                onChange={(e) => handleTextChange(index, e)}
                className="subtitle-textarea"
                rows={Math.max(1, subtitle.text.split('\n').length)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SubtitleEditor;
