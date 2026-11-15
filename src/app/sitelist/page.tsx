import { getSitelistData } from '@/actions/sitelist';
import SitelistClient from './SitelistClient';

export const revalidate = 0;

export default async function SitelistPage() {
  const data = await getSitelistData();

  return (
    <div className="py-2">
      <SitelistClient
        initialEntries={data.entries}
        kecamatanSummaries={data.kecamatanSummaries}
        kabupatenSummaries={data.kabupatenSummaries}
        kecamatanList={data.kecamatanList}
        kabupatenList={data.kabupatenList}
        oltList={data.oltList}
      />
    </div>
  );
}
