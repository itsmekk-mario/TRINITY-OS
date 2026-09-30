import { useEffect, useState } from 'react';
import type { WrongAnswerImage } from '../../types';
import { fetchProblemImageBlobUrl } from '../../lib/problemImage';

export default function ProblemImageView({ image, className = '', alt = '문제 사진' }: { image: WrongAnswerImage; className?: string; alt?: string }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    let objectUrl = '';
    setUrl('');
    setFailed(false);
    void fetchProblemImageBlobUrl(image)
      .then((value) => {
        objectUrl = value;
        if (live) setUrl(value);
        else URL.revokeObjectURL(value);
      })
      .catch(() => { if (live) setFailed(true); });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image.path]);

  if (failed) return <div className={`${className} problem-image-state`} role="img" aria-label={`${alt} 불러오기 실패`}>사진을 불러오지 못했습니다.</div>;
  if (!url) return <div className={`${className} problem-image-state`} role="status">사진 불러오는 중…</div>;
  return <img className={className} src={url} alt={alt}/>;
}
