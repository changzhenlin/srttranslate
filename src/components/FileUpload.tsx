import React, { useState } from 'react';

interface FileUploadProps {
  onFileUpload: (file: File) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload }) => {
  const [isDragging, setIsDragging] = useState(false);
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    processFile(file || null);
    // 重置input值，允许重复上传相同的文件
    event.target.value = '';
  };

  const processFile = (file: File | null) => {
    if (file && file.name.endsWith('.srt')) {
      onFileUpload(file);
    } else if (file) {
      alert('Please upload an SRT format subtitle file');
    }
  };

  const handleButtonClick = () => {
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    processFile(file);
  };

  return (
    <div 
      className={`drag-drop-area ${isDragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input 
        id="fileInput"
        type="file" 
        accept=".srt" 
        onChange={handleFileChange} 
        className="file-input"
      />
      <button 
        className="upload-button" 
        onClick={handleButtonClick}
      >
        <span>UPLOAD SRT FILE</span>
      </button>
      <p className="drag-drop-text">或者将文件拖拽到此处上传</p>
    </div>
  );
};

export default FileUpload;
