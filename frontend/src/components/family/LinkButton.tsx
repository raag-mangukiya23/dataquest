import type { ComponentProps } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui';

/** A Button that navigates (avoids invalid <a><button> nesting and double tab stops). */
export function LinkButton({ to, ...rest }: { to: string } & Omit<ComponentProps<typeof Button>, 'onClick'>) {
  const navigate = useNavigate();
  return <Button {...rest} onClick={() => navigate(to)} />;
}
