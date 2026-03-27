import AuthFormScreen from './AuthFormScreen';
import type { AuthUser } from '../lib/auth';

interface Props {
  onAuthenticated: (user: AuthUser) => void;
  onBack: () => void;
}

export default function OwnerAuthScreen({ onAuthenticated, onBack }: Props) {
  return (
    <AuthFormScreen
      role="owner"
      title="Room Owner"
      fallbackName="Owner"
      icon="home"
      loginSubtitle="Welcome back! Sign in to manage listings"
      signUpSubtitle="Create an account to list your property"
      onAuthenticated={onAuthenticated}
      onBack={onBack}
    />
  );
}
