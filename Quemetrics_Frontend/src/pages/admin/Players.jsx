import { useState } from 'react';
import { Link } from 'react-router-dom';
// import { useAdmin } from '../../hooks/useAdmin';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Loader from '../../components/ui/Loader';

export default function AdminPlayers() {
  // const { allPlayers, loading, getAllPlayers } = useAdmin();
  const [allPlayers] = useState([]);
  const [loading] = useState(false);

  // useEffect(() => {
  //   getAllPlayers();
  // }, []);

  if (loading) return <Loader />;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">All Players</h1>
          <Link to="/admin/dashboard">
            <Button variant="secondary">Back to Dashboard</Button>
          </Link>
        </div>

        <Card>
          {allPlayers.length === 0 ? (
            <p className="text-gray-500">No players found</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Name</th>
                  <th className="text-left py-2">Email</th>
                  <th className="text-left py-2">Organization</th>
                  <th className="text-left py-2">Sports</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {allPlayers.map((player) => (
                  <tr key={player.id} className="border-b">
                    <td className="py-2">{player.name}</td>
                    <td className="py-2">{player.User?.email}</td>
                    <td className="py-2">{player.organization?.organizationName || '-'}</td>
                    <td className="py-2 capitalize">{player.sports?.join(', ')}</td>
                    <td className="py-2">
                      <span className={player.User?.isActive ? 'text-green-600' : 'text-red-600'}>
                        {player.User?.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
