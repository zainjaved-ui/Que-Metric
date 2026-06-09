import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaSave, FaSpinner, FaCheckCircle } from 'react-icons/fa';
import Card from '../../../ui/Card';
import Button from '../../../ui/Button';
import WithdrawalRulesConfig from './WithdrawalRulesConfig';
import apiClient from '../../../../contexts/apiClient';
import { useNotification } from '../../../../contexts/NotificationContext';

/**
 * Tournament Settings Page - Configure withdrawal rules and other settings for existing tournaments
 * Accessed from tournament management dashboard
 */
export default function TournamentSettings() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useNotification();

  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    withdrawalRules: {
      beforeStart: 'remove',
      duringGroup: '50_percent_rule',
      duringKnockout: 'walkover',
    }
  });

  // Load tournament
  useEffect(() => {
    fetchTournament();
  }, [tournamentId]);

  const fetchTournament = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/tournaments/${tournamentId}`);
      if (response.data?.success) {
        const t = response.data.data;
        setTournament(t);

        // Parse withdrawal rules
        let wr = t.withdrawalRules;
        if (typeof wr === 'string') {
          try {
            wr = JSON.parse(wr);
          } catch {
            wr = { beforeStart: 'remove', duringGroup: '50_percent_rule', duringKnockout: 'walkover' };
          }
        }

        setFormData({
          withdrawalRules: wr || { beforeStart: 'remove', duringGroup: '50_percent_rule', duringKnockout: 'walkover' }
        });
      }
    } catch (error) {
      console.error('Error loading tournament:', error);
      showToast('Failed to load tournament settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleNestedChange = (parentKey, childKey, value) => {
    setFormData(prev => ({
      ...prev,
      [parentKey]: {
        ...prev[parentKey],
        [childKey]: value
      }
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await apiClient.put(`/tournaments/${tournamentId}`, {
        withdrawalRules: formData.withdrawalRules
      });

      if (response.data?.success) {
        showToast('Tournament settings updated successfully', 'success');
        // Refresh tournament data
        await fetchTournament();
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      showToast(error.response?.data?.error || 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <FaSpinner className="animate-spin text-3xl text-[#132F45]" />
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <Card className="p-6 text-center">
          <p className="text-gray-600 mb-4">Tournament not found</p>
          <Button onClick={() => navigate(-1)}>Go Back</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
              title="Go back"
            >
              <FaArrowLeft className="text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{tournament.name}</h1>
              <p className="text-sm text-gray-500">Tournament Settings & Withdrawal Rules</p>
            </div>
          </div>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2"
          >
            {saving ? (
              <>
                <FaSpinner className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <FaSave />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Tournament Info Card */}
        <Card className="p-6 mb-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-gray-500 mb-1">Tournament Status</p>
              <p className="text-lg font-semibold text-gray-900 capitalize">{tournament.status}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Tournament Type</p>
              <p className="text-lg font-semibold text-gray-900 capitalize">{tournament.sport}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Start Date</p>
              <p className="text-lg font-semibold text-gray-900">
                {new Date(tournament.startDate).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Participants</p>
              <p className="text-lg font-semibold text-gray-900">
                {tournament.approvedCount || 0} / {tournament.maxParticipants}
              </p>
            </div>
          </div>
        </Card>

        {/* Status Alert - if tournament is in progress */}
        {tournament.status !== 'draft' && tournament.status !== 'registration' && (
          <Card className="p-4 mb-6 bg-blue-50 border-l-4 border-blue-500">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> This tournament has started. Withdrawal rule changes may not affect matches that are already scheduled or completed.
            </p>
          </Card>
        )}

        {/* Withdrawal Rules Configuration */}
        <Card className="p-6">
          <WithdrawalRulesConfig
            formData={formData}
            handleNestedChange={handleNestedChange}
          />
        </Card>

        {/* Info Section */}
        <Card className="mt-6 p-6 bg-green-50 border-l-4 border-green-500">
          <div className="flex gap-4">
            <FaCheckCircle className="text-green-600 text-2xl shrink-0 mt-1" />
            <div>
              <h3 className="font-semibold text-green-900 mb-2">Withdrawal Rules Configuration</h3>
              <ul className="text-sm text-green-800 space-y-1">
                <li>• <strong>Before Start (Required):</strong> Choose how to handle player withdrawals before tournament begins</li>
                <li>• <strong>During Group Stage:</strong> Configure rules for withdrawals during group/round-robin stages</li>
                <li>• <strong>During Knockout:</strong> Set behavior for withdrawals in knockout/elimination rounds</li>
                <li>• Players see these rules when joining and can make informed decisions</li>
                <li>• Rules are automatically enforced when players withdraw from their dashboard</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Footer Buttons */}
        <div className="flex gap-4 mt-8 justify-end">
          <Button
            variant="outline"
            onClick={() => navigate(-1)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2"
          >
            {saving ? (
              <>
                <FaSpinner className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <FaSave />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
