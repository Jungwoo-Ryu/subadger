import AuthFormScreen from './AuthFormScreen';
import type { AuthUser } from '../lib/auth';

interface Props {
  onAuthenticated: (user: AuthUser) => void;
  onBack: () => void;
}

export default function SeekerAuthScreen({ onAuthenticated, onBack }: Props) {
  return (
    <AuthFormScreen
      role="seeker"
      title="Room Seeker"
      fallbackName="Seeker"
      icon="search"
      loginSubtitle="Welcome back! Sign in to continue"
      signUpSubtitle="Create an account to find rooms"
      onAuthenticated={onAuthenticated}
      onBack={onBack}
    />
  );
}
