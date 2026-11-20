import React from 'react';

interface DaoTamLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
}

export const DaoTamLogo: React.FC<DaoTamLogoProps> = ({
  className = '',
  size = 'md',
}) => {
  // Height configurations for the official Dao Tam Logo Image
  const heightClass = {
    sm: 'h-8 sm:h-9',
    md: 'h-10 sm:h-12',
    lg: 'h-14 sm:h-16',
    xl: 'h-18 sm:h-22',
  }[size];

  return (
    <div className={`flex items-center group select-none cursor-pointer ${className}`}>
      {/* Official Đạo Tâm Logo Image */}
      <img
        src="/logo.png"
        alt="ĐẠO TÂM - NỀN TẢNG ĐỌC TRUYỆN & AUDIO"
        className={`${heightClass} w-auto max-w-full object-contain rounded-xl drop-shadow-[0_2px_14px_rgba(244,63,94,0.35)] group-hover:drop-shadow-[0_4px_20px_rgba(236,72,153,0.6)] group-hover:scale-102 transition-all duration-300`}
        loading="eager"
      />
    </div>
  );
};
