import React, { useState } from 'react';
import { FaTimes, FaCopy, FaQrcode, FaCheck } from 'react-icons/fa';

/**
 * AddPlayerForm Component
 * Modal for manually adding players, generating invite links, or creating join codes
 */
export default function AddPlayerForm({
  tournament,
  onClose,
  onAddManual,
  onGenerateInviteLink,
  onGenerateJoinCode,
  availablePlayers = [],
  loadingPlayers = false,
  mode = null,
}) {
  const tabFromMode = (m) => {
    if (!m) return 'manual';
    if (m === 'manual') return 'manual';
    if (m === 'invite' || m === 'invite_link') return 'invite_link';
    if (m === 'join' || m === 'join_code') return 'join_code';
    return 'manual';
  };

  const [activeTab, setActiveTab] = useState(tabFromMode(mode)); // manual, invite_link, join_code
  const isSingleMode = Boolean(mode);
  const [formData, setFormData] = useState({
    selectedPlayerIds: [],
    inviteEmails: [],
    joinCodeConfig: {
      expiryDays: 7,
      maxUsages: 50,
    },
  });

  const [generatedData, setGeneratedData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  // Manual Add Tab
  const handleSelectPlayer = (playerId, selected) => {
    const updated = selected
      ? [...formData.selectedPlayerIds, playerId]
      : formData.selectedPlayerIds.filter((id) => id !== playerId);

    setFormData({ ...formData, selectedPlayerIds: updated });
  };

  const handleAddManualPlayers = async () => {
    if (formData.selectedPlayerIds.length === 0) {
      alert('Please select at least one player');
      return;
    }

    setLoading(true);
    try {
      await onAddManual(formData.selectedPlayerIds);
      setFormData({ ...formData, selectedPlayerIds: [] });
      alert(`${formData.selectedPlayerIds.length} player(s) added successfully!`);
      onClose();
    } catch (error) {
      alert('Error adding players: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Invite Links Tab
  const handleAddInviteEmail = () => {
    setFormData({
      ...formData,
      inviteEmails: [...formData.inviteEmails, ''],
    });
  };

  const handleUpdateInviteEmail = (index, email) => {
    const updated = [...formData.inviteEmails];
    updated[index] = email;
    setFormData({ ...formData, inviteEmails: updated });
  };

  const handleRemoveInviteEmail = (index) => {
    setFormData({
      ...formData,
      inviteEmails: formData.inviteEmails.filter((_, i) => i !== index),
    });
  };

  const handleGenerateInvites = async () => {
    const validEmails = formData.inviteEmails.filter((e) => e.trim());
    if (validEmails.length === 0) {
      alert('Please enter at least one email');
      return;
    }

    setLoading(true);
    try {
      console.log('[handleGenerateInvites] Sending invitations for:', validEmails);
      const result = await onGenerateInviteLink(validEmails);
      console.log('[handleGenerateInvites] Result:', result);

      if (!result || !result.data) {
        throw new Error('Invalid response from server: no invitation data');
      }

      setGeneratedData({
        type: 'invitations',
        data: result.data,
        emails: validEmails,
        emailResults: result.emailResults || [],
        message: result.message,
      });
      setFormData({ ...formData, inviteEmails: [] });
    } catch (error) {
      console.error('[handleGenerateInvites] Error:', error);
      alert(`Error generating invitations: ${error.message || JSON.stringify(error)}`);
    } finally {
      setLoading(false);
    }
  };

  // Join Code Tab
  const handleGenerateCode = async () => {
    setLoading(true);
    try {
      const result = await onGenerateJoinCode({
        expiryDays: formData.joinCodeConfig.expiryDays,
        maxUsages: formData.joinCodeConfig.maxUsages,
      });

      // Handle both result structures: { success, data, message, isNew } or direct invitation object
      const invitationData = result.data || result;
      const message = result.message || (result.success ? "Join code generated" : "Using existing join code");
      const isNew = result.isNew !== false; // Default to true if not specified

      setGeneratedData({
        type: 'join_code',
        data: invitationData,
        message: message,
        isNew: isNew,
      });
    } catch (error) {
      alert('Error generating join code: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Primary action helper (works with single-mode or default tabbed UI)
  const handlePrimaryAction = async () => {
    if (activeTab === 'manual') {
      await handleAddManualPlayers();
    } else if (activeTab === 'invite_link') {
      await handleGenerateInvites();
    } else if (activeTab === 'join_code') {
      await handleGenerateCode();
    }
  };

  const primaryDisabled =
    loading ||
    (activeTab === 'manual' && formData.selectedPlayerIds.length === 0) ||
    (activeTab === 'invite_link' && formData.inviteEmails.filter((e) => e.trim()).length === 0);

  // Generated Data Display
  if (generatedData) {
    const isExistingCode = generatedData.message === "Using existing join code" || !generatedData.isNew;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-2xl font-bold text-gray-900">
              {generatedData.type === 'join_code' ? 'Join Code' : 'Invitations Created'}
            </h3>
            <button
              onClick={onClose}
              className="text-gray-600 hover:text-gray-900 text-2xl"
            >
              <FaTimes />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {generatedData.type === 'join_code' && (
              <div className="space-y-6">
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
                  <h4 className="font-semibold text-blue-900 mb-4">Share This Code</h4>

                  {/* Code Display */}
                  <div className="flex gap-3 mb-6">
                    <div className="flex-1 flex items-center justify-center p-6 bg-white border-2 border-blue-300 rounded-lg">
                      <code className="font-mono text-4xl font-bold text-blue-600">
                        {generatedData?.data?.joinCode || 'N/A'}
                      </code>
                    </div>
                    {generatedData?.data?.joinCode && (
                      <button
                        onClick={() => copyToClipboard(generatedData.data.joinCode)}
                        className="flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition h-fit"
                      >
                        <FaCopy /> Copy
                      </button>
                    )}
                  </div>

                  {/* QR Code Placeholder - Commented Out */}
                  {/* {generatedData?.data?.joinCode && (
                    <div className="bg-gray-50 border border-gray-300 rounded-lg p-4 mb-6">
                      <p className="text-center text-gray-600 font-mono text-sm mb-2">QR Code</p>
                      <div className="w-32 h-32 bg-gray-200 rounded mx-auto flex items-center justify-center">
                        <FaQrcode className="text-gray-400 text-3xl" />
                      </div>
                      <p className="text-center text-xs text-gray-600 mt-2">Generate from: {generatedData.data.joinCode}</p>
                    </div>
                  )} */}

                  {/* Code Details */}
                  <div className="grid grid-cols-2 gap-4 p-4 bg-white rounded-lg border border-gray-200">
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Expires</p>
                      <p className="text-lg font-bold text-gray-900">
                        {generatedData?.data?.joinCodeExpiresAt
                          ? new Date(generatedData.data.joinCodeExpiresAt).toLocaleDateString()
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Max Uses</p>
                      <p className="text-lg font-bold text-gray-900">
                        {generatedData?.data?.maxUsages || '∞'}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Current Uses</p>
                      <p className="text-lg font-bold text-gray-900">
                        {generatedData?.data?.usageCount || 0}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Remaining</p>
                      <p className="text-lg font-bold text-blue-600">
                        {(generatedData?.data?.maxUsages || 0) - (generatedData?.data?.usageCount || 0)}
                      </p>
                    </div>
                  </div>

                  {/* Share Instructions */}
                  <div className="mt-6 p-4 bg-blue-100 rounded-lg">
                    <p className="text-sm text-blue-900 font-semibold mb-2">📋 Share Instructions:</p>
                    <ul className="text-sm text-blue-900 space-y-1">
                      <li>1. Copy the code above</li>
                      <li>2. Share via email, social media, or in-person</li>
                      <li>3. Players enter code on registration page</li>
                      {generatedData?.data?.joinCodeExpiresAt && (
                        <li>4. Valid until {new Date(generatedData.data.joinCodeExpiresAt).toLocaleDateString()}</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {generatedData.type === 'invitations' && (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <p className="text-green-900 font-semibold flex items-center gap-2">
                    <FaCheck /> {generatedData.emails.length} invitation(s) created successfully!
                  </p>
                </div>

                {/* Email Send Status */}
                {generatedData.emailResults && generatedData.emailResults.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="font-semibold text-blue-900 mb-3">📧 Email Delivery Status:</p>
                    <div className="space-y-2">
                      {generatedData.emailResults.map((result, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm p-2 bg-white rounded border border-blue-100">
                          <span className="font-mono text-xs">{result.email}</span>
                          <div className="flex items-center gap-2">
                            {result.sent ? (
                              <>
                                <span className="text-green-600 font-semibold">✓ Sent</span>
                              </>
                            ) : (
                              <>
                                <span className="text-red-600 font-semibold">✗ Failed</span>
                                {result.error && <span className="text-xs text-red-600">({result.error})</span>}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Commented out - Individual invitation links display
                {generatedData.data.map((invitation, idx) => (
                  <div
                    key={idx}
                    className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                  >
                    <div className="flex justify-between items-start gap-4 mb-3">
                      <div>
                        <p className="font-semibold text-gray-900">{invitation.email}</p>
                        <p className="text-xs text-gray-600">
                          Token: {invitation.token.substring(0, 10)}...
                        </p>
                      </div>
                      <span className="inline-block px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
                        Created
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={invitation.invitationLink}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded text-xs font-mono bg-gray-50"
                      />
                      <button
                        onClick={() => copyToClipboard(invitation.invitationLink)}
                        className="p-2 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition"
                      >
                        <FaCopy />
                      </button>
                    </div>
                    <p className="text-xs text-gray-600 mt-2">
                      Expires: {new Date(invitation.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
                */}

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-900 font-semibold mb-2">📧 Next Steps:</p>
                  <ul className="text-sm text-blue-900 space-y-1">
                    {/* <li>• Share individual invitation links with selected players</li>
                    <li>• Each link is unique and expires in 30 days</li>
                    <li>• Players click link and are pre-filled in registration</li> */}
                    <li>• Players have been invited via email</li>
                    <li>• They can accept invitations from their Tournament Invitations dashboard</li>
                    <li>• Once accepted, they will be registered for the tournament</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              onClick={() => setGeneratedData(null)}
              className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-900 hover:bg-gray-100 transition"
            >
              Back
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main Form
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-2xl font-bold text-gray-900">Add Players to Tournament</h3>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-900 text-2xl"
          >
            <FaTimes />
          </button>
        </div>

        {/* Old tabbed UI commented out — use separate modals instead */}
        {/**
         <div className="flex gap-0 border-b border-gray-200">
           <button onClick={() => setActiveTab('manual')} className="...">Manual</button>
           <button onClick={() => setActiveTab('invite_link')} className="...">Invite Link</button>
           <button onClick={() => setActiveTab('join_code')} className="...">Join Code</button>
         </div>
        **/}

        {isSingleMode && (
          <div className="px-6 py-3 border-b border-gray-100">
            <p className="text-sm text-gray-600">
              {activeTab === 'manual'
                ? 'Manual Add'
                : activeTab === 'invite_link'
                ? 'Invite Players'
                : 'Generate Join Code'}
            </p>
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {/* Manual Add Tab */}
          {activeTab === 'manual' && (
            <div className="space-y-4">
              <p className="text-gray-600">
                Select players from your system to add to this tournament manually.
              </p>

              {loadingPlayers ? (
                <div className="p-6 bg-gray-50 rounded-lg text-center text-gray-600">
                  <p className="mb-3">Loading players...</p>
                  <div className="flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                </div>
              ) : availablePlayers.length === 0 ? (
                <div className="p-6 bg-gray-50 rounded-lg text-center text-gray-600">
                  No available players to add
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                  {availablePlayers.map((player) => (
                    <label
                      key={player.id}
                      className="flex items-center gap-3 p-4 hover:bg-gray-50 cursor-pointer transition"
                    >
                      <input
                        type="checkbox"
                        checked={formData.selectedPlayerIds.includes(player.id)}
                        onChange={(e) => handleSelectPlayer(player.id, e.target.checked)}
                        className="w-5 h-5 cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{player.name}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {formData.selectedPlayerIds.length > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-900 font-semibold">
                    {formData.selectedPlayerIds.length} player(s) selected
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Invite Links Tab */}
          {activeTab === 'invite_link' && (
            <div className="space-y-4">
              <p className="text-gray-600">
                Create unique invitation links and send to players. Each link is personalized and expires in 30 days.
              </p>

              <div className="space-y-3">
                {formData.inviteEmails.map((email, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="email"
                      placeholder="player@example.com"
                      value={email}
                      onChange={(e) => handleUpdateInviteEmail(idx, e.target.value)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => handleRemoveInviteEmail(idx)}
                      className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition font-medium"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={handleAddInviteEmail}
                className="w-full px-4 py-2 border-2 border-dashed border-gray-300 text-gray-600 rounded-lg hover:border-blue-500 hover:text-blue-600 transition font-medium"
              >
                + Add Email
              </button>
            </div>
          )}

          {/* Join Code Tab */}
          {activeTab === 'join_code' && (
            <div className="space-y-4">
              <p className="text-gray-600">
                Create a single code that multiple players can use to register. Perfect for announcements or flyers.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Expires in (days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={formData.joinCodeConfig.expiryDays}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        joinCodeConfig: {
                          ...formData.joinCodeConfig,
                          expiryDays: parseInt(e.target.value),
                        },
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Max Uses
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.joinCodeConfig.maxUsages}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        joinCodeConfig: {
                          ...formData.joinCodeConfig,
                          maxUsages: parseInt(e.target.value),
                        },
                      })
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-900">
                  A code will be generated that players can enter on the registration page. You can share it via email,
                  printed flyers, or social media.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg font-medium text-gray-900 hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={handlePrimaryAction}
            disabled={primaryDisabled}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? 'Processing...' : activeTab === 'manual' ? 'Add Selected' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
