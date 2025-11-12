import React from 'react';

interface FileUploadProps {
  onFileUpload: (file: File) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload }) => {
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.endsWith('.srt')) {
      onFileUpload(file);
    } else {
      alert('请上传SRT格式的字幕文件');
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.name.endsWith('.srt')) {
      onFileUpload(file);
    } else {
      alert('请上传SRT格式的字幕文件');
    }
  };

  return (
    <div 
      className="file-upload"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input 
        type="file" 
        accept=".srt" 
        onChange={handleFileChange} 
        className="file-input"
      />
      <div className="upload-text">
        点击上传或拖拽文件到此处
      </div>
    </div>
  );
};

export default FileUpload;
