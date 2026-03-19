import { redirect } from 'next/navigation';

const pageHeading = <h1 className="sr-only">Practice</h1>;

export default function PracticePage() {
  redirect('/practice/play-maia');
  return pageHeading;
}
