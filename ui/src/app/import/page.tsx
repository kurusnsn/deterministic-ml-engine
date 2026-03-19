import { redirect } from 'next/navigation';

const pageHeading = <h1 className="sr-only">Import</h1>;

export default function ImportRedirect() {
  // Default /import to the upload flow
  redirect('/openingtree');
  return pageHeading;
}
