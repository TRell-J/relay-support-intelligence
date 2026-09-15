import { redirect } from 'next/navigation';

/** Employee Help is where the narrative starts. */
export default function Home() {
  redirect('/help');
}
