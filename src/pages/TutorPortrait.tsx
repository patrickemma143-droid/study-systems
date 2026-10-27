// Renders one tutor's portrait (used by scripts/tutor-heads/portraits.mjs to make /tutors/<id>.webp).
import { useParams } from 'react-router-dom';
import { TutorAvatar } from '../components/TutorAvatar';

export default function TutorPortrait() {
  const id = useParams().id || 'amara';
  return (
    <div className="portrait-page">
      <TutorAvatar tutor={id} framing="portrait" still onReady={() => window.setTimeout(() => (document.title = 'portrait-ready'), 300)} />
    </div>
  );
}
