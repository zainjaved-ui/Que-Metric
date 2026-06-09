const Joi = require("joi");

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      console.error("Validation error details:", error.details);
      const errors = error.details.map((detail) => detail.message);
      return res.status(400).json({ success: false, error: errors.join(", ") });
    }
    next();
  };
};

const schemas = {
  // Auth schemas
  registerPlayer: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Please provide a valid email address",
      "any.required": "Email is required",
    }),
    password: Joi.string().min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])/)
      .required()
      .messages({
        "string.min": "Password must be at least 8 characters",
        "string.pattern.base": "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&#)",
        "any.required": "Password is required",
      }),
    confirmPassword: Joi.string().valid(Joi.ref("password")).required().messages({
      "any.only": "Passwords do not match",
      "any.required": "Please confirm your password",
    }),
    name: Joi.string().pattern(/^[A-Za-z\s]+$/).max(50).required().messages({
      "string.pattern.base": "Name must only contain alphabets and spaces",
      "string.max": "Name must not exceed 50 characters",
      "any.required": "Full name is required",
    }),
    dateOfBirth: Joi.date().max("now").required().messages({
      "date.base": "Please provide a valid date of birth",
      "date.max": "Date of birth cannot be in the future",
      "any.required": "Date of birth is required",
    }),
    experienceLevel: Joi.string().required().messages({
      "any.required": "Experience level is required",
    }),
    address: Joi.string().required().messages({
      "any.required": "Full address is required",
    }),
    mobileNumber: Joi.string().pattern(/^\d{7,15}$/).required().messages({
      "string.pattern.base": "Mobile number must be a valid number (including country code)",
      "any.required": "Mobile number is required",
    }),
    bio: Joi.string().allow("").optional(),
    organizationId: Joi.any().optional().allow(null, ""),
  }),

  registerOrganization: Joi.object({
    email: Joi.string().email().required().messages({
      "string.email": "Please provide a valid email address",
      "any.required": "Email is required",
    }),
    password: Joi.string().min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])/)
      .required()
      .messages({
        "string.min": "Password must be at least 8 characters",
        "string.pattern.base": "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&#)",
        "any.required": "Password is required",
      }),
    confirmPassword: Joi.string().valid(Joi.ref("password")).required().messages({
      "any.only": "Passwords do not match",
      "any.required": "Please confirm your password",
    }),
    organizationName: Joi.string().pattern(/^[A-Za-z\s]+$/).max(50).required().messages({
      "string.pattern.base": "Organization name must only contain alphabets and spaces",
      "string.max": "Organization name must not exceed 50 characters",
      "any.required": "Organization name is required",
    }),
    contactPersonName: Joi.string().pattern(/^[A-Za-z\s]+$/).max(50).required().messages({
      "string.pattern.base": "Contact person name must only contain alphabets and spaces",
      "string.max": "Contact person name must not exceed 50 characters",
      "any.required": "Contact person name is required",
    }),
    phoneNumber: Joi.string().pattern(/^\d{7,15}$/).required().messages({
      "string.pattern.base": "Phone number must be a valid number (including country code)",
      "any.required": "Phone number is required",
    }),
    isClub: Joi.boolean().optional(),
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid("player", "organization", "venue_owner", "super_admin").optional(),
  }),

  resendVerification: Joi.object({
    email: Joi.string().email().required(),
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().required(),
  }),

  forgotPassword: Joi.object({
    email: Joi.string().email().required(),
  }),

  resetPassword: Joi.object({
    resetToken: Joi.string().required(),
    newPassword: Joi.string().min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])/)
      .required()
      .messages({
        "string.min": "Password must be at least 8 characters",
        "string.pattern.base": "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&#)",
        "any.required": "New password is required",
      }),
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])/)
      .required()
      .messages({
        "string.min": "Password must be at least 8 characters",
        "string.pattern.base": "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&#)",
        "any.required": "New password is required",
      }),
  }),

  updateNotificationPreferences: Joi.object({
    tournamentInvites: Joi.boolean().required(),
  }),

  deleteAccount: Joi.object({
    password: Joi.string().required(),
  }),

  // Organization schemas
  updateOrganization: Joi.object({
    organizationName: Joi.string().pattern(/^[A-Za-z\s]+$/).max(50).messages({
      "string.pattern.base": "Organization name must only contain alphabets and spaces",
      "string.max": "Organization name must not exceed 50 characters",
    }),
    contactPersonName: Joi.string().pattern(/^[A-Za-z\s]+$/).max(50).messages({
      "string.pattern.base": "Contact person name must only contain alphabets and spaces",
      "string.max": "Contact person name must not exceed 50 characters",
    }),
    phoneNumber: Joi.string().pattern(/^\d{11}$/).messages({
      "string.pattern.base": "Phone number must be exactly 11 digits",
    }),
    organizationType: Joi.string().valid("club", "association", "federation", "league", "independent"),
    description: Joi.string().allow(""),
    website: Joi.string().allow(""),
    socialMediaLinks: Joi.object(),
    logoUrl: Joi.string().allow(""),
    registrationNumber: Joi.string().allow(""),
  }),

  inviteVenueOwner: Joi.object({
    email: Joi.string().email().required(),
    name: Joi.string().pattern(/^[A-Za-z\s]+$/).max(50).required().messages({
      "string.pattern.base": "Name must only contain alphabets and spaces",
      "string.max": "Name must not exceed 50 characters",
      "any.required": "Name is required",
    }),
    phoneNumber: Joi.string().pattern(/^\d{11}$/).allow("").messages({
      "string.pattern.base": "Phone number must be exactly 11 digits",
    }),
    venueIds: Joi.array().items(Joi.string()).optional(),
  }),

  // Venue Owner schemas
  acceptInvitation: Joi.object({
    invitationToken: Joi.string().required(),
    password: Joi.string().min(6).required(),
  }),

  updateVenueOwner: Joi.object({
    name: Joi.string().pattern(/^[A-Za-z\s]+$/).max(50).messages({
      "string.pattern.base": "Name must only contain alphabets and spaces",
      "string.max": "Name must not exceed 50 characters",
    }),
    phoneNumber: Joi.string().pattern(/^\d{11}$/).allow("").messages({
      "string.pattern.base": "Phone number must be exactly 11 digits",
    }),
    venueName: Joi.string().allow(""),
    address: Joi.string().allow(""),
    numberOfTables: Joi.number().integer().min(0),
    facilities: Joi.string().allow(""),
    openingHours: Joi.string().allow(""),
  }),

  // Player schemas
  updatePlayer: Joi.object({
    name: Joi.string().pattern(/^[A-Za-z\s]+$/).max(50).messages({
      "string.pattern.base": "Name must only contain alphabets and spaces",
      "string.max": "Name must not exceed 50 characters",
    }),
    nickname: Joi.string().allow(""),
    dateOfBirth: Joi.date().max("now"),
    identityChangeReason: Joi.string().max(500).allow(""),
    nameChangeReason: Joi.string().max(500).allow(""),
    gender: Joi.string().valid("male", "female", "other", "prefer_not_to_say"),
    phoneNumber: Joi.string().pattern(/^\d{11}$/).allow("").messages({
      "string.pattern.base": "Phone number must be exactly 11 digits",
    }),
    mobileNumber: Joi.string().pattern(/^\d{11}$/).allow("").messages({
      "string.pattern.base": "Mobile number must be exactly 11 digits",
    }),
    address: Joi.string().allow(""),
    experienceLevel: Joi.string().allow(""),
    sports: Joi.array().items(Joi.string().valid("snooker", "pool", "pooker")),
    bio: Joi.string().allow(""),
    disabilityFlag: Joi.boolean(),
  }),

  // League schemas
  createLeague: Joi.object({
    name: Joi.string().required(),
    sport: Joi.string().valid("snooker", "pool", "pooker").required(),
    seasonStart: Joi.date().required(),
    seasonEnd: Joi.date().required(),
    divisions: Joi.object(),
    scoringFormat: Joi.object(),
    status: Joi.string().valid("draft", "active", "completed", "cancelled"),
    description: Joi.string().allow(""),
    venue: Joi.string().allow(""),
  }),

  updateLeague: Joi.object({
    name: Joi.string(),
    sport: Joi.string().valid("snooker", "pool", "pooker"),
    seasonStart: Joi.date(),
    seasonEnd: Joi.date(),
    divisions: Joi.object(),
    scoringFormat: Joi.object(),
    status: Joi.string().valid("draft", "active", "completed", "cancelled"),
    description: Joi.string().allow(""),
    venue: Joi.string().allow(""),
  }),

  // Tournament schemas
  createTournament: Joi.object({
    name: Joi.string().required(),
    sport: Joi.string().valid("snooker", "pool", "pooker").required(),
    tier: Joi.string().valid("local", "county", "regional", "national").default("local"),
    format: Joi.string().valid("knockout", "round_robin", "group_knockout").default("knockout"),
    startDate: Joi.date().required(),
    endDate: Joi.date(),
    venue: Joi.string().allow(""),
    venueIds: Joi.array().items(Joi.string().uuid()),
    entryFee: Joi.number().min(0),
    maxParticipants: Joi.number().integer().min(2),
    status: Joi.string().valid("upcoming", "registration", "in_progress", "completed", "cancelled"),
    description: Joi.string().allow(""),
  }),

  updateTournament: Joi.object({
    name: Joi.string(),
    sport: Joi.string().valid("snooker", "pool", "pooker"),
    tier: Joi.string().valid("local", "county", "regional", "national"),
    format: Joi.string().valid("knockout", "round_robin", "group_knockout"),
    startDate: Joi.date(),
    endDate: Joi.date(),
    venue: Joi.string().allow(""),
    venueIds: Joi.array().items(Joi.string().uuid()),
    entryFee: Joi.number().min(0),
    maxParticipants: Joi.number().integer().min(2),
    status: Joi.string().valid("upcoming", "registration", "in_progress", "completed", "cancelled"),
    description: Joi.string().allow(""),
  }),

  // Admin schemas
  rejectOrganization: Joi.object({
    reason: Joi.string().required(),
  }),
  mergeDuplicateUsers: Joi.object({
    email: Joi.string().email().required(),
    primaryUserId: Joi.string().uuid().optional(),
    dryRun: Joi.boolean().optional(),
  }),
  rejectIdentityChange: Joi.object({
    reason: Joi.string().allow(""),
  }),
};

module.exports = { validate, schemas };
