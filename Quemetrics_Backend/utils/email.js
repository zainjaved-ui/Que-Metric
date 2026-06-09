const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/** Base URL for links in emails (never empty — avoids broken buttons). */
const frontendBaseUrl = () => String(process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");

const sendEmail = async ({ to, subject, html, text }) => {
  if (!to || String(to).trim() === "") {
    console.warn("[sendEmail] Skipped: missing recipient address");
    return { success: false, error: "missing recipient" };
  }
  try {
    // Verify SMTP credentials are configured
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error("[sendEmail] SMTP credentials not configured:", {
        host: process.env.SMTP_HOST ? "set" : "missing",
        user: process.env.SMTP_USER ? "set" : "missing",
        pass: process.env.SMTP_PASS ? "set" : "missing",
      });
      return { success: false, error: "Email service not configured" };
    }

    const mailOptions = {
      from: process.env.SMTP_FROM || "CueMetrics <noreply@cuemetrics.com>",
      to,
      subject,
      html,
      text,
    };

    console.log("[sendEmail] Attempting to send email to:", to, "subject:", subject);
    const info = await transporter.sendMail(mailOptions);
    console.log("[sendEmail] SUCCESS - Email sent:", info.messageId, "to:", to);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("[sendEmail] FAILED - Error sending email to", to, ":", {
      message: error.message,
      code: error.code,
      response: error.response,
      command: error.command,
      stack: error.stack,
    });
    return { success: false, error: error.message };
  }
};

const sendVenueOwnerInvitation = async ({ email, name, invitationToken, organizationName, venueNames = [] }) => {
  const inviteUrl = `${process.env.FRONTEND_URL}/venue-owner/accept-invitation?token=${invitationToken}`;

  // Build venue list HTML/text if provided
  const venueHtml = (Array.isArray(venueNames) && venueNames.length)
    ? `<p><strong>Assigned Venues:</strong></p><ul>${venueNames.map(v => `<li>${v}</li>`).join('')}</ul>`
    : '';

  const venueText = (Array.isArray(venueNames) && venueNames.length)
    ? `Assigned Venues:\n${venueNames.map(v => `- ${v}`).join('\n')}\n\n`
    : '';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>You're Invited to Join CueMetrics!</h2>
      <p>Hello ${name},</p>
      <p><strong>${organizationName}</strong> has invited you to join as a Venue Owner on CueMetrics.</p>
      ${venueHtml}
      <p>Click the button below to accept the invitation and set up your account:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${inviteUrl}"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Accept Invitation
        </a>
      </p>
      <p>Or copy and paste this link in your browser:</p>
      <p style="word-break: break-all; color: #666;">${inviteUrl}</p>
      <p><strong>This invitation expires in 7 days.</strong></p>
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <p style="color: #666; font-size: 12px;">
        If you didn't expect this invitation, you can ignore this email.
      </p>
    </div>
  `;

  const text = `
    You're Invited to Join CueMetrics!

    Hello ${name},

    ${organizationName} has invited you to join as a Venue Owner on CueMetrics.

    ${venueText}Click the link below to accept the invitation:
    ${inviteUrl}

    This invitation expires in 7 days.
  `;

  return sendEmail({
    to: email,
    subject: `Invitation to join ${organizationName} on CueMetrics`,
    html,
    text,
  });
};

const sendPasswordResetEmail = async ({ email, resetToken }) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Password Reset Request</h2>
      <p>You requested to reset your password on CueMetrics.</p>
      <p>Click the button below to reset your password:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Reset Password
        </a>
      </p>
      <p>Or copy and paste this link in your browser:</p>
      <p style="word-break: break-all; color: #666;">${resetUrl}</p>
      <p><strong>This link expires in 30 minutes.</strong></p>
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <p style="color: #666; font-size: 12px;">
        If you didn't request this, you can ignore this email.
      </p>
    </div>
  `;

  const text = `
    Password Reset Request

    You requested to reset your password on CueMetrics.

    Click the link below to reset your password:
    ${resetUrl}

    This link expires in 30 minutes.

    If you didn't request this, you can ignore this email.
  `;

  return sendEmail({
    to: email,
    subject: "Reset your CueMetrics password",
    html,
    text,
  });
};

const getSafeFrontendUrl = (frontendUrl) => {
  const candidate = String(frontendUrl || "").trim();
  if (candidate && /^https?:\/\//i.test(candidate)) {
    return candidate.replace(/\/$/, "");
  }
  return frontendBaseUrl();
};

const sendEmailVerification = async ({ email, name, verificationToken, frontendUrl }) => {
  const baseUrl = getSafeFrontendUrl(frontendUrl);
  const verifyUrl = `${baseUrl}/verify-email?token=${verificationToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Welcome to CueMetrics, ${name}!</h2>
      <p>Thank you for registering as a player on CueMetrics.</p>
      <p>To complete your registration and activate your account, please verify your email address by clicking the button below:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Verify Email Address
        </a>
      </p>
      <p>Or copy and paste this link in your browser:</p>
      <p style="word-break: break-all; color: #666;">${verifyUrl}</p>
      <p><strong>This verification link expires in 24 hours.</strong></p>
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <h3>What happens next?</h3>
      <p>Once you verify your email, you'll be able to:</p>
      <ul>
        <li>Join leagues and tournaments</li>
        <li>Log match results</li>
        <li>Book tables</li>
        <li>Appear in player rankings and searches</li>
      </ul>
      <p style="color: #666; font-size: 12px;">
        If you didn't create this account, you can ignore this email.
      </p>
    </div>
  `;

  const text = `
    Welcome to CueMetrics, ${name}!

    Thank you for registering as a player on CueMetrics.

    To complete your registration and activate your account, please verify your email address by clicking the link below:
    ${verifyUrl}

    This verification link expires in 24 hours.

    Once you verify your email, you'll be able to:
    - Join leagues and tournaments
    - Log match results
    - Book tables
    - Appear in player rankings and searches

    If you didn't create this account, you can ignore this email.
  `;

  return sendEmail({
    to: email,
    subject: "Verify your CueMetrics account",
    html,
    text,
  });
};

const sendClubVerificationEmail = async ({ email, clubName, verificationLink, verificationToken, expiresIn }) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Verify Your Club on CueMetrics</h2>
      <p>Hello,</p>
      <p>Thank you for creating a club on CueMetrics! Your club <strong>${clubName}</strong> has been created successfully.</p>
      <p>To complete the setup and activate your club, please verify your email address by clicking the button below:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${verificationLink}"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Verify Club Email
        </a>
      </p>
      <p>Or copy and paste this link in your browser:</p>
      <p style="word-break: break-all; color: #666;">${verificationLink}</p>
      <p style="margin: 20px 0;"><strong>Verification Token (if link doesn't work):</strong></p>
      <p style="background-color: #f3f4f6; padding: 10px; border-radius: 4px; font-family: monospace; word-break: break-all;">${verificationToken}</p>
      <p><strong>This verification link expires in ${expiresIn}.</strong></p>
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <h3>What happens next?</h3>
      <p>Once you verify your club email, you'll be able to:</p>
      <ul>
        <li>Invite club members and manage roles</li>
        <li>Create and manage club events and tournaments</li>
        <li>Link venues to your club</li>
        <li>View club announcements and communications</li>
        <li>Access all club management features</li>
      </ul>
      <p style="color: #666; font-size: 12px;">
        If you didn't create this club, you can ignore this email. If you have any questions, please contact our support team.
      </p>
    </div>
  `;

  const text = `
    Verify Your Club on CueMetrics

    Hello,

    Thank you for creating a club on CueMetrics! Your club ${clubName} has been created successfully.

    To complete the setup and activate your club, please verify your email address by clicking the link below:
    ${verificationLink}

    Verification Token (if link doesn't work):
    ${verificationToken}

    This verification link expires in ${expiresIn}.

    What happens next?
    Once you verify your club email, you'll be able to:
    - Invite club members and manage roles
    - Create and manage club events and tournaments
    - Link venues to your club
    - View club announcements and communications
    - Access all club management features

    If you didn't create this club, you can ignore this email.
  `;

  return sendEmail({
    to: email,
    subject: `Verify Your Club: ${clubName} on CueMetrics`,
    html,
    text,
  });
};

const sendLeagueInvitation = async ({ email, name, invitationToken, leagueName, organizerName }) => {
  const inviteUrl = `${process.env.FRONTEND_URL}/league/join/${invitationToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>You're Invited to Join a League on CueMetrics!</h2>
      <p>Hello ${name || 'Player'},</p>
      <p><strong>${organizerName || 'An organizer'}</strong> has invited you to join the league <strong>${leagueName}</strong> on CueMetrics.</p>
      <p>Click the button below to accept the invitation and join the league:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${inviteUrl}"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Accept Invitation
        </a>
      </p>
      <p>Or copy and paste this link in your browser:</p>
      <p style="word-break: break-all; color: #666;">${inviteUrl}</p>
      <p><strong>This invitation may expire.</strong></p>
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <p style="color: #666; font-size: 12px;">If you didn't expect this invitation, you can ignore this email.</p>
    </div>
  `;

  const text = `
    You're Invited to Join a League on CueMetrics!

    Hello ${name || 'Player'},

    ${organizerName || 'An organizer'} has invited you to join the league ${leagueName} on CueMetrics.

    Click the link below to accept the invitation:
    ${inviteUrl}

    If you didn't expect this invitation, you can ignore this email.
  `;

  return sendEmail({
    to: email,
    subject: `Invitation to join league: ${leagueName}`,
    html,
    text,
  });
};

const sendTournamentInvitation = async ({ email, name, invitationToken, tournamentId, tournamentName, organizerName, inviteLink }) => {
  const inviteUrl = inviteLink || `${process.env.FRONTEND_URL}/tournament/join/${tournamentId || tournamentName}?token=${invitationToken}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>You're Invited to Join a Tournament on CueMetrics!</h2>
      <p>Hello ${name || 'Player'},</p>
      <p><strong>${organizerName || 'An organizer'}</strong> has invited you to join the tournament <strong>${tournamentName}</strong> on CueMetrics.</p>
      <!-- <p>Click the button below to accept the invitation and register for the tournament:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${inviteUrl}"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Accept Invitation
        </a>
      </p>
      <p>Or copy and paste this link in your browser:</p>
      <p style="word-break: break-all; color: #666;">${inviteUrl}</p> -->
      <p>Please log in to your CueMetrics account and visit your Tournament Invitations dashboard to accept this invitation.</p>
      <p><strong>This invitation may expire.</strong></p>
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <p style="color: #666; font-size: 12px;">If you didn't expect this invitation, you can ignore this email.</p>
    </div>
  `;

  const text = `
    You're Invited to Join a Tournament on CueMetrics!

    Hello ${name || 'Player'},

    ${organizerName || 'An organizer'} has invited you to join the tournament ${tournamentName} on CueMetrics.

    /* Click the link below to accept the invitation:
    ${inviteUrl} */

    Please log in to your CueMetrics account and visit your Tournament Invitations dashboard to accept this invitation.

    If you didn't expect this invitation, you can ignore this email.
  `;

  return sendEmail({
    to: email,
    subject: `Invitation to join tournament: ${tournamentName}`,
    html,
    text,
  });
};

const sendVenueApprovalRequest = async ({ recipientEmail, recipientName, venueName, organizationName, organizerContactEmail }) => {
  const dashboardUrl = `${frontendBaseUrl()}/venue-owner/dashboard`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Venue Access Request</h2>
      <p>Hello ${recipientName},</p>
      <p><strong>${organizationName}</strong> is requesting to use your venue <strong>${venueName}</strong> for a league or tournament on CueMetrics.</p>
      <p>You can approve or reject this request from your venue owner dashboard:</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${dashboardUrl}"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Open Venue Owner Dashboard
        </a>
      </p>
      <p><strong>Request Details:</strong></p>
      <ul>
        <li>Requesting Organization: ${organizationName}</li>
        <li>Venue: ${venueName}</li>
        <li>Contact: ${organizerContactEmail}</li>
      </ul>
      <p style="color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px;">
        If you have any questions about this request, please contact the organization directly at ${organizerContactEmail}.
      </p>
    </div>
  `;

  const text = `
    Venue Access Request

    Hello ${recipientName},

    ${organizationName} is requesting to use your venue ${venueName} for a league or tournament on CueMetrics.

    Request Details:
    - Requesting Organization: ${organizationName}
    - Venue: ${venueName}
    - Contact: ${organizerContactEmail}

    You can approve or reject this request in your CueMetrics dashboard:
    ${dashboardUrl}
  `;

  return sendEmail({
    to: recipientEmail,
    subject: `Venue Access Request: ${venueName}`,
    html,
    text,
  });
};

/**
 * Email venue owner when an organizer selects their venue for a tournament (pending approval).
 */
// const sendTournamentVenueRequestEmail = async ({
//   recipientEmail,
//   recipientName,
//   venueName,
//   tournamentName,
//   organizationName,
//   organizerContactEmail,
//   requestId,
// }) => {
//   const base = frontendBaseUrl();
//   const dashboardUrl = `${base}/venue-owner/dashboard`;
//   const html = `
//     <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
//       <h2>Tournament needs your venue</h2>
//       <p>Hello ${recipientName || "there"},</p>
//       <p><strong>${organizationName}</strong> created a tournament draft <strong>${tournamentName}</strong> and selected your venue <strong>${venueName}</strong>.</p>
//       <p>Please review and accept or decline this request in your venue owner dashboard.</p>
//       <p style="text-align: center; margin: 30px 0;">
//         <a href="${dashboardUrl}"
//            style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
//           Review tournament venue request
//         </a>
//       </p>
//       <p><strong>Details:</strong></p>
//       <ul>
//         <li>Tournament: ${tournamentName}</li>
//         <li>Venue: ${venueName}</li>
//         <li>Organizer: ${organizationName}</li>
//         <li>Contact: ${organizerContactEmail}</li>
//         ${requestId ? `<li>Request reference: ${requestId}</li>` : ""}
//       </ul>
//       <p style="word-break: break-all; color: #666; font-size: 13px;">If the button does not work, copy this link:<br/>${dashboardUrl}</p>
//       <p style="color: #666; font-size: 12px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">
//         Log in with your venue owner account to see pending tournament venue requests.
//       </p>
//     </div>
//   `;

//   const text = `
// Tournament venue request — ${tournamentName}

// Hello ${recipientName || "there"},

// ${organizationName} selected your venue "${venueName}" for tournament "${tournamentName}".

// Open your dashboard to accept or decline:
// ${dashboardUrl}

// Tournament: ${tournamentName}
// Venue: ${venueName}
// Contact: ${organizerContactEmail}
// ${requestId ? `Request reference: ${requestId}\n` : ""}
//   `.trim();

//   return sendEmail({
//     to: recipientEmail,
//     subject: `Tournament venue request: ${tournamentName} at ${venueName}`,
//     html,
//     text,
//   });
// };

const sendTournamentVenueRequestEmail = async ({
  recipientEmail,
  recipientName,
  venueName,
  tournamentName,
  organizationName,
  organizerContactEmail,
  requestId,
}) => {
  const base = frontendBaseUrl();
  const dashboardUrl = `${base}/venue-owner/dashboard`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Tournament needs your venue</h2>
      <p>Hello ${recipientName || "there"},</p>
      <p><strong>${organizationName}</strong> created a tournament draft <strong>${tournamentName}</strong> and selected your venue <strong>${venueName}</strong>.</p>
      <p>Please review and accept or decline this request in your venue owner dashboard.</p>
      <p><strong>Details:</strong></p>
      <ul>
        <li>Tournament: ${tournamentName}</li>
        <li>Venue: ${venueName}</li>
        <li>Organizer: ${organizationName}</li>
        <li>Contact: ${organizerContactEmail}</li>
      </ul>
      <p style="color: #666; font-size: 12px; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">
        Log in with your venue owner account to see pending tournament venue requests.
      </p>
    </div>
  `;

  const text = `
Tournament venue request — ${tournamentName}

Hello ${recipientName || "there"},

${organizationName} selected your venue "${venueName}" for tournament "${tournamentName}".

Open your dashboard to accept or decline:
${dashboardUrl}

Tournament: ${tournamentName}
Venue: ${venueName}
Contact: ${organizerContactEmail}
  `.trim();

  return sendEmail({
    to: recipientEmail,
    subject: `Tournament venue request: ${tournamentName} at ${venueName}`,
    html,
    text,
  });
};

const sendVenueApprovalEmail = async ({ recipientEmail, recipientName, venueName, venueOwnerName, status, reason }) => {
  const isApproved = status === "approved";
  const title = isApproved ? "Venue Access Approved" : "Venue Access Request Declined";
  const statusColor = isApproved ? "#059669" : "#dc2626";
  const statusMessage = isApproved
    ? `Your request to use the venue <strong>${venueName}</strong> has been approved!`
    : `Your request to use the venue <strong>${venueName}</strong> has been declined.`;

  const reasonHtml = reason ? `<p><strong>Reason:</strong> ${reason}</p>` : "";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${statusColor};">${title}</h2>
      <p>Hello ${recipientName},</p>
      <p>${statusMessage}</p>
      ${reasonHtml}
      <p><strong>Venue Details:</strong></p>
      <ul>
        <li>Venue: ${venueName}</li>
        <li>Owner: ${venueOwnerName}</li>
      </ul>
      ${isApproved ? `
        <p>You can now use this venue for your leagues and tournaments. You'll find it in your venue dropdown when creating or updating leagues.</p>
      ` : `
        <p>Try reaching out to the venue owner if you'd like to discuss this decision or make alternative arrangements.</p>
      `}
      <p style="color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px;">
        CueMetrics - Tournament & League Management Platform
      </p>
    </div>
  `;

  const text = `
    ${title}

    Hello ${recipientName},

    ${statusMessage}

    ${reasonHtml ? `Reason: ${reason}\n\n` : ''}

    Venue Details:
    - Venue: ${venueName}
    - Owner: ${venueOwnerName}

    ${isApproved ? `
    You can now use this venue for your leagues and tournaments.
    ` : `
    Try reaching out to the venue owner if you'd like to discuss this decision.
    `}
  `;

  return sendEmail({
    to: recipientEmail,
    subject: title,
    html,
    text,
  });
};

const sendBookingCreatedEmail = async ({ opponentEmail, opponentName, creatorName, matchDetails, leagueName, fixtureRound, bookingDate, venueName, timeSlot }) => {
  const myBookingsUrl = `${process.env.FRONTEND_URL}/player/mybookings`;
  const sportEmoji = matchDetails.sport === 'snooker' ? '🎱' : matchDetails.sport === 'pool' ? '🏓' : '🃏';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>${sportEmoji} New Booking Request</h2>
      <p>Hello ${opponentName || 'Player'},</p>
      <p><strong>${creatorName}</strong> has requested to book a table for your match!</p>

      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #132F45;">Booking Details</h3>
        <ul style="list-style: none; padding: 0;">
          <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
            <strong>League:</strong> ${leagueName}
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
            <strong>Round:</strong> Round ${fixtureRound}
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
            <strong>Date:</strong> ${new Date(bookingDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
            <strong>Time:</strong> ${timeSlot}
          </li>
          <li style="padding: 8px 0;">
            <strong>Venue:</strong> ${venueName}
          </li>
        </ul>
      </div>

      <p><strong>What happens next?</strong></p>
      <p>Please review this booking request and either accept or reject it. To respond to this booking:</p>

      <p style="text-align: center; margin: 30px 0;">
        <a href="${myBookingsUrl}"
           style="background-color: #132F45; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          View My Bookings
        </a>
      </p>

      <p style="color: #666; font-size: 13px; background-color: #fef3c7; padding: 12px; border-left: 4px solid #f59e0b; border-radius: 4px; margin: 20px 0;">
        <strong>⏰ Note:</strong> The opponent has 48 hours to accept or reject this booking. After that, it may be automatically cancelled.
      </p>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <p style="color: #666; font-size: 12px;">
        Best regards,<br>
        The CueMetrics Team
      </p>
    </div>
  `;

  const text = `
    ${sportEmoji} New Booking Request

    Hello ${opponentName || 'Player'},

    ${creatorName} has requested to book a table for your match!

    Booking Details:
    - League: ${leagueName}
    - Round: Round ${fixtureRound}
    - Date: ${new Date(bookingDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
    - Time: ${timeSlot}
    - Venue: ${venueName}

    To accept or reject this booking, visit:
    ${myBookingsUrl}

    Note: You have 48 hours to accept or reject this booking.

    Best regards,
    The CueMetrics Team
  `;

  return sendEmail({
    to: opponentEmail,
    subject: `New Booking Request from ${creatorName}`,
    html,
    text,
  });
};

const sendTournamentBookingCreatedEmail = async ({ opponentEmail, opponentName, creatorName, matchDetails, tournamentName, roundLabel, bookingDate, venueName, timeSlot }) => {
  const myBookingsUrl = `${process.env.FRONTEND_URL}/player/mybookings`;
  const sportEmoji = matchDetails.sport === 'snooker' ? '🎱' : matchDetails.sport === 'pool' ? '🏓' : '🃏';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>${sportEmoji} New Tournament Booking Request</h2>
      <p>Hello ${opponentName || 'Player'},</p>
      <p><strong>${creatorName}</strong> has requested to book a table for your tournament match!</p>

      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #132F45;">Booking Details</h3>
        <ul style="list-style: none; padding: 0;">
          <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
            <strong>Tournament:</strong> ${tournamentName}
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
            <strong>Round:</strong> ${roundLabel}
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
            <strong>Date:</strong> ${new Date(bookingDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
            <strong>Time:</strong> ${timeSlot}
          </li>
          <li style="padding: 8px 0;">
            <strong>Venue:</strong> ${venueName}
          </li>
        </ul>
      </div>

      <p><strong>What happens next?</strong></p>
      <p>Please review this booking request and either accept or reject it. To respond to this booking, log in to your CueMetrics account and visit your bookings page.</p>

      <p style="color: #666; font-size: 13px; background-color: #fef3c7; padding: 12px; border-left: 4px solid #f59e0b; border-radius: 4px; margin: 20px 0;">
        <strong>⏰ Note:</strong> The opponent has 48 hours to accept or reject this booking. After that, it may be automatically cancelled.
      </p>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <p style="color: #666; font-size: 12px;">
        Best regards,<br>
        The CueMetrics Team
      </p>
    </div>
  `;

  const text = `
    ${sportEmoji} New Tournament Booking Request

    Hello ${opponentName || 'Player'},

    ${creatorName} has requested to book a table for your tournament match!

    Booking Details:
    - Tournament: ${tournamentName}
    - Round: ${roundLabel}
    - Date: ${new Date(bookingDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
    - Time: ${timeSlot}
    - Venue: ${venueName}

    // To accept or reject this booking, visit:
    // ${myBookingsUrl}

    Note: You have 48 hours to accept or reject this booking.

    Best regards,
    The CueMetrics Team
  `;

  return sendEmail({
    to: opponentEmail,
    subject: `New Tournament Booking Request from ${creatorName}`,
    html,
    text,
  });
};

const sendTournamentBookingConfirmedEmail = async ({ playerEmail, playerName, opponentName, matchDetails, tournamentName, roundLabel, bookingDate, venueName, timeSlot }) => {
  const sportEmoji = matchDetails.sport === 'snooker' ? '🎱' : matchDetails.sport === 'pool' ? '🏓' : '🃏';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #059669;">✅ Tournament Booking Confirmed</h2>
      <p>Hello ${playerName || 'Player'},</p>
      <p>Great news! Your tournament match against <strong>${opponentName}</strong> has been confirmed and the table is booked!</p>

      <div style="background-color: #ecfdf5; border-left: 4px solid #059669; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #065f46;">Match Confirmed</h3>
        <ul style="list-style: none; padding: 0;">
          <li style="padding: 8px 0; border-bottom: 1px solid #d1fae5;">
            <strong>Tournament:</strong> ${tournamentName}
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid #d1fae5;">
            <strong>vs ${opponentName}</strong>
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid #d1fae5;">
            <strong>Round:</strong> ${roundLabel}
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid #d1fae5;">
            <strong>Date & Time:</strong> ${new Date(bookingDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${timeSlot}
          </li>
          <li style="padding: 8px 0;">
            <strong>Venue:</strong> ${venueName}
          </li>
        </ul>
      </div>

      <p><strong>Important Reminders:</strong></p>
      <ul>
        <li>Make sure to arrive 10-15 minutes early for setup</li>
        <li>Contact the opponent if you need to reschedule</li>
        <li>Remember to log the match result after the game</li>
      </ul>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <p style="color: #666; font-size: 12px;">
        Best regards,<br>
        The CueMetrics Team
      </p>
    </div>
  `;

  const text = `
    ✅ Tournament Booking Confirmed

    Hello ${playerName || 'Player'},

    Great news! Your tournament match against ${opponentName} has been confirmed and the table is booked!

    Match Confirmed:
    - Tournament: ${tournamentName}
    - vs ${opponentName}
    - Round: ${roundLabel}
    - Date & Time: ${new Date(bookingDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${timeSlot}
    - Venue: ${venueName}

    Important Reminders:
    - Make sure to arrive 10-15 minutes early for setup
    - Contact the opponent if you need to reschedule
    - Remember to log the match result after the game

    Best regards,
    The CueMetrics Team
  `;

  return sendEmail({
    to: playerEmail,
    subject: `✅ Tournament Booking Confirmed: ${tournamentName} vs ${opponentName}`,
    html,
    text,
  });
};

const sendTournamentBookingRejectedEmail = async ({ playerEmail, playerName, opponentName, matchDetails, tournamentName, roundLabel, rejectionReason }) => {
  const sportEmoji = matchDetails.sport === 'snooker' ? '🎱' : matchDetails.sport === 'pool' ? '🏓' : '🃏';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">❌ Tournament Booking Request Rejected</h2>
      <p>Hello ${playerName || 'Player'},</p>
      <p><strong>${opponentName}</strong> has declined the booking request for your tournament match.</p>

      <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #7f1d1d;">Booking Declined</h3>
        <ul style="list-style: none; padding: 0;">
          <li style="padding: 8px 0; border-bottom: 1px solid #fee2e2;">
            <strong>Tournament:</strong> ${tournamentName}
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid #fee2e2;">
            <strong>Round:</strong> ${roundLabel}
          </li>
          <li style="padding: 8px 0;">
            <strong>Opponent:</strong> ${opponentName}
          </li>
        </ul>
      </div>

      ${rejectionReason ? `
        <div style="background-color: #f9fafb; padding: 12px; border-radius: 4px; margin: 20px 0;">
          <p><strong>Reason:</strong></p>
          <p style="margin: 0; color: #374151;">${rejectionReason}</p>
        </div>
      ` : ''}

      <p><strong>What should you do?</strong></p>
      <p>You can reach out to ${opponentName} to discuss alternative dates and times, or try booking again with a different time slot that works better for both of you.</p>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <p style="color: #666; font-size: 12px;">
        Best regards,<br>
        The CueMetrics Team
      </p>
    </div>
  `;

  const text = `
    ❌ Tournament Booking Request Rejected

    Hello ${playerName || 'Player'},

    ${opponentName} has declined the booking request for your tournament match.

    Booking Declined:
    - Tournament: ${tournamentName}
    - Round: ${roundLabel}
    - Opponent: ${opponentName}

    ${rejectionReason ? `Reason: ${rejectionReason}\n\n` : ''}

    You can reach out to ${opponentName} to discuss alternative dates and times, or try booking again with a different time slot.

    Best regards,
    The CueMetrics Team
  `;

  return sendEmail({
    to: playerEmail,
    subject: `❌ Tournament Booking Declined: ${tournamentName}`,
    html,
    text,
  });
};

const sendBookingConfirmedEmail = async ({ playerEmail, playerName, opponentName, matchDetails, leagueName, fixtureRound, bookingDate, venueName, timeSlot }) => {
  const sportEmoji = matchDetails.sport === 'snooker' ? '🎱' : matchDetails.sport === 'pool' ? '🏓' : '🃏';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #059669;">✅ Booking Confirmed</h2>
      <p>Hello ${playerName || 'Player'},</p>
      <p>Great news! Your match against <strong>${opponentName}</strong> has been confirmed and the table is booked!</p>

      <div style="background-color: #ecfdf5; border-left: 4px solid #059669; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #065f46;">Match Confirmed</h3>
        <ul style="list-style: none; padding: 0;">
          <li style="padding: 8px 0; border-bottom: 1px solid #d1fae5;">
            <strong>League:</strong> ${leagueName}
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid #d1fae5;">
            <strong>vs ${opponentName}</strong>
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid #d1fae5;">
            <strong>Round:</strong> Round ${fixtureRound}
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid #d1fae5;">
            <strong>Date & Time:</strong> ${new Date(bookingDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${timeSlot}
          </li>
          <li style="padding: 8px 0;">
            <strong>Venue:</strong> ${venueName}
          </li>
        </ul>
      </div>

      <p><strong>Important Reminders:</strong></p>
      <ul>
        <li>Make sure to arrive 10-15 minutes early for setup</li>
        <li>Contact the opponent if you need to reschedule</li>
        <li>Remember to log the match result after the game</li>
      </ul>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <p style="color: #666; font-size: 12px;">
        Best regards,<br>
        The CueMetrics Team
      </p>
    </div>
  `;

  const text = `
    ✅ Booking Confirmed

    Hello ${playerName || 'Player'},

    Great news! Your match against ${opponentName} has been confirmed and the table is booked!

    Match Confirmed:
    - League: ${leagueName}
    - vs ${opponentName}
    - Round: Round ${fixtureRound}
    - Date & Time: ${new Date(bookingDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${timeSlot}
    - Venue: ${venueName}

    Important Reminders:
    - Make sure to arrive 10-15 minutes early for setup
    - Contact the opponent if you need to reschedule
    - Remember to log the match result after the game

    Best regards,
    The CueMetrics Team
  `;

  return sendEmail({
    to: playerEmail,
    subject: `✅ Booking Confirmed: ${leagueName} vs ${opponentName}`,
    html,
    text,
  });
};

const sendBookingRejectedEmail = async ({ playerEmail, playerName, opponentName, matchDetails, leagueName, fixtureRound, rejectionReason }) => {
  const sportEmoji = matchDetails.sport === 'snooker' ? '🎱' : matchDetails.sport === 'pool' ? '🏓' : '🃏';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">❌ Booking Request Rejected</h2>
      <p>Hello ${playerName || 'Player'},</p>
      <p><strong>${opponentName}</strong> has declined the booking request for your match.</p>

      <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #7f1d1d;">Booking Declined</h3>
        <ul style="list-style: none; padding: 0;">
          <li style="padding: 8px 0; border-bottom: 1px solid #fee2e2;">
            <strong>League:</strong> ${leagueName}
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid #fee2e2;">
            <strong>Round:</strong> Round ${fixtureRound}
          </li>
          <li style="padding: 8px 0;">
            <strong>Opponent:</strong> ${opponentName}
          </li>
        </ul>
      </div>

      ${rejectionReason ? `
        <div style="background-color: #f9fafb; padding: 12px; border-radius: 4px; margin: 20px 0;">
          <p><strong>Reason:</strong></p>
          <p style="margin: 0; color: #374151;">${rejectionReason}</p>
        </div>
      ` : ''}

      <p><strong>What should you do?</strong></p>
      <p>You can reach out to ${opponentName} to discuss alternative dates and times, or try booking again with a different time slot that works better for both of you.</p>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <p style="color: #666; font-size: 12px;">
        Best regards,<br>
        The CueMetrics Team
      </p>
    </div>
  `;

  const text = `
    ❌ Booking Request Rejected

    Hello ${playerName || 'Player'},

    ${opponentName} has declined the booking request for your match.

    Booking Declined:
    - League: ${leagueName}
    - Round: Round ${fixtureRound}
    - Opponent: ${opponentName}

    ${rejectionReason ? `Reason: ${rejectionReason}\n\n` : ''}

    You can reach out to ${opponentName} to discuss alternative dates and times, or try booking again with a different time slot.

    Best regards,
    The CueMetrics Team
  `;

  return sendEmail({
    to: playerEmail,
    subject: `❌ Booking Declined for ${leagueName}`,
    html,
    text,
  });
};

const sendBookingCancelledEmail = async ({ recipientEmail, recipientName, senderName, matchDetails, leagueName, fixtureRound, cancellationReason, bookingDate, timeSlot, venueName }) => {
  const sportEmoji = matchDetails.sport === 'snooker' ? '🎱' : (matchDetails.sport === 'pool' || matchDetails.sport === 'pooker') ? '🏓' : '🃏';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #6b7280;">⚠️ Booking Cancelled</h2>
      <p>Hello ${recipientName || 'Player'},</p>
      <p><strong>${senderName}</strong> has cancelled the booking for your match.</p>

      <div style="background-color: #f3f4f6; border-left: 4px solid #6b7280; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #1f2937;">Match Cancelled</h3>
        <ul style="list-style: none; padding: 0;">
          <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
            <strong>League:</strong> ${leagueName}
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
            <strong>Round:</strong> Round ${fixtureRound}
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">
            <strong>Original Slot:</strong> ${new Date(bookingDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${timeSlot}
          </li>
          <li style="padding: 8px 0;">
            <strong>Venue:</strong> ${venueName}
          </li>
        </ul>
      </div>

      ${cancellationReason ? `
        <div style="background-color: #f9fafb; padding: 12px; border-radius: 4px; margin: 20px 0;">
          <p><strong>Reason for cancellation:</strong></p>
          <p style="margin: 0; color: #374151;">${cancellationReason}</p>
        </div>
      ` : ''}

      <p><strong>What's next?</strong></p>
      <p>You can now book a new time slot for this match on the Booking Table.</p>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <p style="color: #666; font-size: 12px;">
        Best regards,<br>
        The CueMetrics Team
      </p>
    </div>
  `;

  const text = `
    ⚠️ Booking Cancelled

    Hello ${recipientName || 'Player'},

    ${senderName} has cancelled the booking for your match.

    Cancelled Match Details:
    - League: ${leagueName}
    - Round: Round ${fixtureRound}
    - Date & Time: ${new Date(bookingDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}, ${timeSlot}
    - Venue: ${venueName}

    ${cancellationReason ? `Reason: ${cancellationReason}\n\n` : ''}

    You can now book a new time slot for this match.

    Best regards,
    The CueMetrics Team
  `;

  return sendEmail({
    to: recipientEmail,
    subject: `⚠️ Booking Cancelled for ${leagueName}`,
    html,
    text,
  });
};

const sendWalkoverSubmittedEmail = async ({ opponentEmail, opponentName, submitterName, leagueName, fixtureRound, matchDetails, walkoverReason }) => {
  const sportEmoji = matchDetails.sport === 'snooker' ? '🎱' : (matchDetails.sport === 'pool' || matchDetails.sport === 'pooker') ? '🏓' : '🃏';
  const sport = matchDetails.sport ? matchDetails.sport.charAt(0).toUpperCase() + matchDetails.sport.slice(1) : 'Match';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #b45309;">${sportEmoji} Walkover Result Submitted</h2>
      <p>Hello ${opponentName || 'Player'},</p>
      <p>Your opponent <strong>${submitterName}</strong> has submitted a <strong>Walk Over</strong> result for your ${sport} match.</p>

      <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #92400e;">Match Details</h3>
        <ul style="list-style: none; padding: 0; margin: 0;">
          <li style="padding: 8px 0; border-bottom: 1px solid #fde68a;">
            <strong>League:</strong> ${leagueName}
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid #fde68a;">
            <strong>Round:</strong> Round ${fixtureRound}
          </li>
          <li style="padding: 8px 0; border-bottom: 1px solid #fde68a;">
            <strong>Submitted by:</strong> ${submitterName}
          </li>
          <li style="padding: 8px 0;">
            <strong>Result:</strong> Walk Over (${submitterName} wins)
          </li>
        </ul>
      </div>

      ${walkoverReason ? `
        <div style="background-color: #f9fafb; padding: 12px; border-radius: 4px; margin: 20px 0; border: 1px solid #e5e7eb;">
          <p style="margin: 0 0 4px 0;"><strong>Reason:</strong></p>
          <p style="margin: 0; color: #374151;">${walkoverReason}</p>
        </div>
      ` : ''}

      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 4px; margin: 20px 0;">
        <p style="margin: 0; color: #166534; font-size: 14px;">
          <strong>ℹ️ What happens next?</strong><br>
          This walkover result is now pending admin review. You will be notified once it has been approved or rejected.
        </p>
      </div>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <p style="color: #666; font-size: 12px;">
        Best regards,<br>
        The CueMetrics Team
      </p>
    </div>
  `;

  const text = `
    ${sportEmoji} Walkover Result Submitted

    Hello ${opponentName || 'Player'},

    Your opponent ${submitterName} has submitted a Walk Over result for your ${sport} match.

    Match Details:
    - League: ${leagueName}
    - Round: Round ${fixtureRound}
    - Submitted by: ${submitterName}
    - Result: Walk Over (${submitterName} wins)

    ${walkoverReason ? `Reason: ${walkoverReason}\n` : ''}

    This walkover result is pending admin review. You will be notified once approved or rejected.

    Best regards,
    The CueMetrics Team
  `;

  return sendEmail({
    to: opponentEmail,
    subject: `${sportEmoji} Walk Over Result Submitted — ${leagueName}`,
    html,
    text,
  });
};

const sendMatchResultSubmissionEmail = async ({ opponentEmail, opponentName, submitterName, matchDetails, leagueName, scoreSummary }) => {
  const pendingActionsUrl = `${process.env.FRONTEND_URL}/player/results`;
  const sportEmoji = matchDetails.sport === 'snooker' ? '🎱' : (matchDetails.sport === 'pool' || matchDetails.sport === 'pooker') ? '🏓' : '🃏';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>${sportEmoji} Match Result Awaiting Confirmation</h2>
      <p>Hello ${opponentName || 'Player'},</p>
      <p><strong>${submitterName}</strong> has submitted the result for your recent match in <strong>${leagueName}</strong>.</p>

      <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
        <h3 style="margin-top: 0; color: #132F45;">Submitted Score</h3>
        <p style="font-size: 24px; font-weight: bold; margin: 10px 0;">${scoreSummary}</p>
      </div>

      <p><strong>Action Required:</strong></p>
      <p>Please review the submitted result. You need to either confirm that the scores are correct or dispute them if you disagree.</p>

      <p style="text-align: center; margin: 30px 0;">
        <a href="${pendingActionsUrl}"
           style="background-color: #132F45; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Review Result
        </a>
      </p>

      <p style="color: #666; font-size: 13px; background-color: #fffbeb; padding: 12px; border-left: 4px solid #f59e0b; border-radius: 4px; margin: 20px 0;">
        <strong>Note:</strong> If you don't take action, the result may remain pending or be subject to league-specific auto-confirmation rules.
      </p>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <p style="color: #666; font-size: 12px;">
        Best regards,<br>
        The CueMetrics Team
      </p>
    </div>
  `;

  const text = `
    ${sportEmoji} Match Result Awaiting Confirmation

    Hello ${opponentName || 'Player'},

    ${submitterName} has submitted the result for your recent match in ${leagueName}.

    Submitted Score: ${scoreSummary}

    To confirm or dispute this result, please visit:
    ${pendingActionsUrl}

    Best regards,
    The CueMetrics Team
  `;

  return sendEmail({
    to: opponentEmail,
    subject: `Match Result Submitted by ${submitterName}`,
    html,
    text,
  });
};

const sendWalkoverRejectedEmail = async ({ playerEmail, playerName, opponentName, leagueName, fixtureRound, rejectionReason }) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">❌ Walkover Result Rejected</h2>
      <p>Hello ${playerName},</p>
      <p>The walkover result submitted for your match against <strong>${opponentName || 'your opponent'}</strong> in <strong>${leagueName}</strong> has been rejected by the league administrator.</p>

      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #991b1b;">Rejection Details</h3>
        <p style="margin: 0; color: #374151;"><strong>Reason:</strong> ${rejectionReason || 'No specific reason provided.'}</p>
      </div>

      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 12px; border-radius: 4px; margin: 20px 0;">
        <p style="margin: 0; color: #166534; font-size: 14px;">
          <strong>ℹ️ What happens next?</strong><br>
          The walkover has been cancelled and the match has been reopened. You and your opponent can now play the match and submit a regular score, or reschedule it if needed.
        </p>
      </div>

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <p style="color: #666; font-size: 12px;">
        Best regards,<br>
        The CueMetrics Team
      </p>
    </div>
  `;

  const text = `
    Walkover Result Rejected

    Hello ${playerName},

    The walkover result submitted for your match against ${opponentName || 'your opponent'} in ${leagueName} has been rejected by the league administrator.

    Reason: ${rejectionReason || 'No specific reason provided.'}

    The walkover has been cancelled and the match has been reopened. You can now play the match and submit a regular score.

    Best regards,
    The CueMetrics Team
  `;

  return sendEmail({
    to: playerEmail,
    subject: `❌ Walkover Rejected — ${leagueName}`,
    html,
    text,
  });
};

const sendMatchResultStatusUpdateEmail = async ({ playerEmail, playerName, opponentName, status, leagueName, scoreSummary }) => {
  const isConfirmed = status === 'Confirmed' || status === 'Awaiting Admin Approval';
  const statusTitle = isConfirmed ? '✅ Match Result Confirmed' : '⚠️ Match Result Disputed';
  const statusColor = isConfirmed ? '#059669' : '#dc2626';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${statusColor};">${statusTitle}</h2>
      <p>Hello ${playerName},</p>

      <p>Your match result against <strong>${opponentName}</strong> in <strong>${leagueName}</strong> has been <strong>${status.toLowerCase()}</strong>.</p>

      <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; border: 1px solid #e5e7eb;">
        <h3 style="margin-top: 0; color: #132F45;">Final Score</h3>
        <p style="font-size: 24px; font-weight: bold; margin: 10px 0;">${scoreSummary}</p>
      </div>

      ${!isConfirmed ? `
        <p><strong>Note:</strong> Since the result was disputed, it will now be reviewed by the league organization. No further action is required from you at this time.</p>
      ` : `
        <p>The result has been finalized and league standings have been updated accordingly.</p>
      `}

      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <p style="color: #666; font-size: 12px;">
        Best regards,<br>
        The CueMetrics Team
      </p>
    </div>
  `;

  const text = `
    ${statusTitle}

    Hello ${playerName},

    Your match result against ${opponentName} in ${leagueName} has been ${status.toLowerCase()}.

    Score Summary: ${scoreSummary}

    ${!isConfirmed ? 'The result was disputed and will be reviewed by the league organization.' : 'The result has been finalized.'}

    Best regards,
    The CueMetrics Team
  `;

  return sendEmail({
    to: playerEmail,
    subject: `${statusTitle}: ${leagueName}`,
    html,
    text,
  });
};

const sendLeagueEnrollmentEmail = async ({ email, name, leagueName, organizerName, divisionName }) => {
  const dashboardUrl = `${process.env.FRONTEND_URL}/dashboard`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>You've Been Added to a League!</h2>
      <p>Hello ${name || 'Player'},</p>
      <p>Great news! <strong>${organizerName || 'An organizer'}</strong> has added you to the league <strong>${leagueName}</strong> on CueMetrics.</p>
      ${divisionName ? `<p>You have been assigned to: <strong>${divisionName}</strong></p>` : ''}
      <p>Your fixtures may have already been generated if the league is active. You can check your upcoming matches and league standings in your dashboard.</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${dashboardUrl}"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          View My Dashboard
        </a>
      </p>
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <p style="color: #666; font-size: 12px;">CueMetrics - Tournament & League Management Platform</p>
    </div>
  `;

  const text = `
    You've Been Added to a League!

    Hello ${name || 'Player'},

    ${organizerName || 'An organizer'} has added you to the league ${leagueName} on CueMetrics.
    ${divisionName ? `Division: ${divisionName}\n` : ''}

    Check your dashboard for fixtures and standings:
    ${dashboardUrl}
  `;

  return sendEmail({
    to: email,
    subject: `You've been added to league: ${leagueName}`,
    html,
    text,
  });
};

const sendTournamentAdvancementEmail = async ({ email, playerName, leagueName, currentRound, nextRound, stage }) => {
  const stageLabel = stage ? `${stage.charAt(0).toUpperCase() + stage.slice(1)} ` : '';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>🎉 ${stageLabel}Qualification Achieved</h2>
      <p>Hello ${playerName || 'Player'},</p>
      <p>Congratulations! You have qualified for <strong>round ${nextRound}</strong> in league <strong>${leagueName}</strong>.</p>
      <p>Current round: ${currentRound}. Next round: ${nextRound}. Keep up the great performance!</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          View My Progress
        </a>
      </p>
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <p style="color: #666; font-size: 12px;">
        Best regards,<br>
        The CueMetrics Team
      </p>
    </div>
  `;

  const text = `
    ${stageLabel}Qualification Achieved

    Hello ${playerName || 'Player'},

    Congratulations! You have qualified for round ${nextRound} in ${leagueName}.
    Current round: ${currentRound}. Next round: ${nextRound}.

    Visit your dashboard: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard

    Best regards,
    The CueMetrics Team
  `;

  return sendEmail({
    to: email,
    subject: `Champion track: Qualified for Round ${nextRound} in ${leagueName}`,
    html,
    text,
  });
};

const sendTournamentChampionEmail = async ({ email, playerName, leagueName }) => {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>🏆 Champion Declared!</h2>
      <p>Hello ${playerName || 'Player'},</p>
      <p>Awesome news: You are the champion of <strong>${leagueName}</strong>! Your performance was outstanding.</p>
      <p>Celebrate your well-earned victory, and look forward to future events on CueMetrics.</p>
      <p style="text-align: center; margin: 30px 0;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard"
           style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          View My Dashboard
        </a>
      </p>
      <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
      <p style="color: #666; font-size: 12px;">
        Best regards,<br>
        The CueMetrics Team
      </p>
    </div>
  `;

  const text = `
    Champion Declared!

    Hello ${playerName || 'Player'},

    Awesome news: You are the champion of ${leagueName}!

    Visit your dashboard: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard

    Best regards,
    The CueMetrics Team
  `;

  return sendEmail({
    to: email,
    subject: `🏆 ${leagueName} Champion`,
    html,
    text,
  });
};

const sendOrganizerScheduledEmail = async ({ playerEmail, playerName, opponentName, leagueName, round, scheduledDate, startTime, venueName, tableName }) => {
  const uploadScoreUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/player/dashboard`;
  let formattedDate = 'TBD';
  try {
    formattedDate = new Date(scheduledDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) {}

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333333; line-height: 1.6;">
      <div style="background-color: #132F45; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h2 style="color: #ffffff; margin: 0; font-weight: 900; letter-spacing: 1px;">📅 MATCH SCHEDULED BY ORGANIZER</h2>
      </div>
      <div style="padding: 30px 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
        <p>Hello <strong>${playerName}</strong>,</p>
        <p>Your match in the league <strong>${leagueName}</strong> against <strong>${opponentName}</strong> has been officially scheduled by the organizer!</p>

        <div style="background-color: #f8fafc; border-left: 4px solid #132F45; padding: 20px; border-radius: 6px; margin: 24px 0;">
          <h3 style="margin-top: 0; color: #132F45; font-size: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Match Details:</h3>
          <ul style="list-style: none; padding: 0; margin: 0;">
            <li style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
              <strong>League:</strong> ${leagueName}
            </li>
            <li style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
              <strong>Round:</strong> Round ${round}
            </li>
            <li style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
              <strong>Opponent:</strong> vs ${opponentName}
            </li>
            <li style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
              <strong>Date:</strong> ${formattedDate}
            </li>
            <li style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">
              <strong>Time:</strong> ${startTime}
            </li>
            <li style="padding: 8px 0;">
              <strong>Venue & Table:</strong> ${venueName} - ${tableName}
            </li>
          </ul>
        </div>

        <p>This match is now confirmed in the system. Once the match has been played, you can upload the score directly from your dashboard.</p>

        <p style="text-align: center; margin: 35px 0;">
          <a href="${uploadScoreUrl}"
             style="background-color: #132F45; color: #ffffff; padding: 14px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Upload Match Score
          </a>
        </p>

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
        <p style="font-size: 12px; color: #64748b; text-align: center;">
          CueMetrics - Tournament & League Management Platform
        </p>
      </div>
    </div>
  `;

  const text = `
    MATCH SCHEDULED BY ORGANIZER

    Hello ${playerName},

    Your match in the league ${leagueName} against ${opponentName} has been officially scheduled by the organizer!

    Match Details:
    - League: ${leagueName}
    - Round: Round ${round}
    - Opponent: vs ${opponentName}
    - Date: ${formattedDate}
    - Time: ${startTime}
    - Venue & Table: ${venueName} - ${tableName}

    This match is now confirmed in the system. Once the match has been played, you can upload the score directly from your dashboard:
    ${uploadScoreUrl}

    CueMetrics - Tournament & League Management Platform
  `.trim();

  return sendEmail({
    to: playerEmail,
    subject: `📅 Match Scheduled: vs ${opponentName} (${leagueName})`,
    html,
    text,
  });
};

module.exports = {
  sendEmail,
  sendVenueOwnerInvitation,
  sendPasswordResetEmail,
  sendEmailVerification,
  sendClubVerificationEmail,
  sendLeagueInvitation,
  sendLeagueEnrollmentEmail,
  sendTournamentInvitation,
  sendVenueApprovalRequest,
  sendTournamentAdvancementEmail,
  sendTournamentChampionEmail,
  sendVenueApprovalEmail,
  sendBookingCreatedEmail,
  sendTournamentBookingCreatedEmail,
  sendBookingConfirmedEmail,
  sendTournamentBookingConfirmedEmail,
  sendBookingRejectedEmail,
  sendBookingCancelledEmail,
  sendMatchResultSubmissionEmail,
  sendMatchResultStatusUpdateEmail,
  sendWalkoverSubmittedEmail,
  sendWalkoverRejectedEmail,
  sendTournamentVenueRequestEmail,
  sendOrganizerScheduledEmail,
};
