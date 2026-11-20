import React from 'react';
import { Novel, ReadingProgress } from '../types';
import StoryCard from './StoryCard';

interface NovelCardProps {
  novel: Novel;
  progress?: ReadingProgress;
  onSelect: (novel: Novel) => void;
  onResumeReading?: (novel: Novel, progress: ReadingProgress) => void;
  onSelectCreator?: (creatorName: string) => void;
}

export const NovelCard: React.FC<NovelCardProps> = ({
  novel,
  progress,
  onSelect,
}) => {
  return (
    <StoryCard
      novel={novel}
      variant="catalog"
      progress={progress}
      onSelect={onSelect}
    />
  );
};
