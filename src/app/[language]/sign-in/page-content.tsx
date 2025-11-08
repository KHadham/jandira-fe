"use client";
import { useState, useCallback, useMemo, useEffect } from "react";
import Button from "@mui/material/Button";
import withPageRequiredGuest from "@/services/auth/with-page-required-guest";
import { useForm, FormProvider } from "react-hook-form";
import {
  useAuthPhoneRequestOtpService,
  useAuthPhoneVerifyOtpService,
  type AuthPhoneRequestOtpRequest,
} from "@/services/api/services/auth";
import useAuthActions from "@/services/auth/use-auth-actions";
import useAuthTokens from "@/services/auth/use-auth-tokens";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import FormTextInput from "@/components/form/text-input/form-text-input";
import * as yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import HTTP_CODES_ENUM from "@/services/api/types/http-codes";
import { useTranslation } from "@/services/i18n/client";
import { useSnackbar } from "@/hooks/use-snackbar";

type SignInFormData = {
  fullName?: string;
  phone: string;
  otp?: string;
};

const useValidationSchema = (isOtpSent: boolean) => {
  const { t } = useTranslation("sign-in");

  // Schema for Step 1: Requesting OTP
  const requestOtpSchema = yup.object({
    fullName: yup.string(), // Optional
    phone: yup
      .string()
      .required(t("sign-in:inputs.phone.validation.required"))
      .min(10, t("sign-in:inputs.phone.validation.length"))
      .matches(/^\d+$/, t("sign-in:inputs.phone.validation.numeric")),
    otp: yup.string(), // Not required
  });

  // Schema for Step 2: Verifying OTP
  const verifyOtpSchema = yup.object({
    fullName: yup.string(),
    phone: yup
      .string()
      .required(t("sign-in:inputs.phone.validation.required"))
      .min(10, t("sign-in:inputs.phone.validation.length"))
      .matches(/^\d+$/, t("sign-in:inputs.phone.validation.numeric")),
    otp: yup.string().required(t("sign-in:inputs.otp.validation.required")),
  });

  // Return the correct schema based on the state
  return useMemo(
    () => (isOtpSent ? verifyOtpSchema : requestOtpSchema),
    [isOtpSent, requestOtpSchema, verifyOtpSchema]
  );
};

function Form() {
  const { setUser } = useAuthActions();
  const { setTokensInfo } = useAuthTokens();
  const { enqueueSnackbar } = useSnackbar();
  const { t } = useTranslation("sign-in");

  // State for the 2-step flow and countdown
  const [isSubmitting, setIsSubmiting] = useState(false);
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // API Hooks
  const requestOtp = useAuthPhoneRequestOtpService();
  const verifyOtp = useAuthPhoneVerifyOtpService();

  // Validation Schema
  const validationSchema = useValidationSchema(isOtpSent);

  const methods = useForm({
    resolver: yupResolver(validationSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      otp: "",
    },
  });

  const { handleSubmit, setError, trigger, getValues, reset } = methods;

  // const { isSubmitting } = useFormState({ control: methods.control });

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const onSubmit = handleSubmit(async (formData) => {
    setIsSubmiting(true);
    const { data, status } = await verifyOtp({
      phone: formData.phone,
      otp: formData.otp as string,
    });

    if (status === HTTP_CODES_ENUM.UNPROCESSABLE_ENTITY) {
      setIsSubmiting(false);
      setError("otp", {
        type: "manual",
        message: t("sign-in:alerts.wrongOTP"),
      });
      return;
    }

    if (status === HTTP_CODES_ENUM.OK) {
      setIsSubmiting(false);
      enqueueSnackbar(t("sign-in:alerts.success"), {
        variant: "success",
      });

      setTokensInfo({
        token: data.token,
        refreshToken: data.refreshToken,
        tokenExpires: data.tokenExpires,
      });
      setUser(data.user);
    }
  });

  const handleRequestOtp = useCallback(async () => {
    const isValid = await trigger(["phone", "fullName"]);
    if (!isValid) return;

    setIsSubmiting(true);
    try {
      const { phone, fullName } = getValues();
      const payload: AuthPhoneRequestOtpRequest = { phone };
      if (fullName) payload.fullName = fullName;

      const { status } = await requestOtp(payload);

      if (status === HTTP_CODES_ENUM.OK) {
        setIsOtpSent(true);
        setCountdown(30);
        enqueueSnackbar(t("sign-in:alert.otpSent"), { variant: "success" });
        return;
      }

      setError("phone", {
        type: "manual",
        message: t("sign-in:alerts.otpResentFailed"),
      });
    } finally {
      setIsSubmiting(false);
    }
  }, [trigger, getValues, requestOtp, enqueueSnackbar, t, setError]);

  // Handler for 'Resend OTP'
  const handleResendOtp = useCallback(async () => {
    const { phone, fullName } = getValues();
    const payload: AuthPhoneRequestOtpRequest = { phone };
    if (fullName) {
      payload.fullName = fullName;
    }

    const { status } = await requestOtp(payload);
    setCountdown(30);

    if (status === HTTP_CODES_ENUM.OK) {
      // setCountdown(30);
      enqueueSnackbar(t("sign-in:messages.otpResent"), { variant: "success" });
    } else {
      enqueueSnackbar(t("sign-in:inputs.phone.validation.server.error"), {
        variant: "error",
      });
    }
  }, [getValues, requestOtp, setCountdown, enqueueSnackbar, t]);

  // Handler for 'Back' button
  const handleBack = useCallback(() => {
    setIsOtpSent(false);
    setCountdown(0);
    reset({
      fullName: getValues("fullName"),
      phone: getValues("phone"),
      otp: "",
    });
  }, [reset, getValues]);

  return (
    <FormProvider {...methods}>
      <Container maxWidth="xs">
        <form onSubmit={onSubmit}>
          <Grid container spacing={2} mb={2}>
            <Grid size={{ xs: 12 }} mt={3}>
              <Typography variant="h6">{t("sign-in:title")}</Typography>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <FormTextInput<SignInFormData>
                name="phone"
                label={t("sign-in:inputs.phone.label")}
                type="tel"
                testId="phone"
                disabled={isOtpSent || isSubmitting}
              />
            </Grid>

            {isOtpSent ? (
              <Grid size={{ xs: 12 }}>
                <FormTextInput<SignInFormData>
                  name="otp"
                  label={t("sign-in:inputs.otp.label")}
                  type="text"
                  testId="otp"
                  disabled={isSubmitting}
                />
              </Grid>
            ) : (
              <Grid size={{ xs: 12 }}>
                <FormTextInput<SignInFormData>
                  name="fullName"
                  label={t("sign-in:inputs.fullname.label")}
                  type="text"
                  testId="fullName"
                  disabled={isOtpSent || isSubmitting}
                />
              </Grid>
            )}

            <Grid size={{ xs: 12 }}>
              {!isOtpSent ? (
                <Grid container justifyContent="flex-end">
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleRequestOtp}
                    disabled={isSubmitting}
                    data-testid="send-otp-submit"
                    fullWidth
                    loading={isSubmitting}
                  >
                    {t("sign-in:actions.sendOtp")}
                  </Button>
                </Grid>
              ) : (
                <Stack
                  spacing={2}
                  direction="row"
                  justifyContent={"space-between"}
                  sx={{ width: "100%" }}
                >
                  <Button
                    variant="outlined"
                    onClick={handleBack}
                    data-testid="back-button"
                    sx={{ flex: 1, minWidth: 0 }}
                    loading={isSubmitting}
                  >
                    {t("sign-in:actions.back")}
                  </Button>
                  <Button
                    variant="contained"
                    color="primary"
                    type="submit"
                    disabled={isSubmitting}
                    loading={isSubmitting}
                    data-testid="sign-in-submit"
                    sx={{ flex: 1, minWidth: 0 }}
                  >
                    {t("sign-in:actions.verify")}
                  </Button>
                  <Button
                    variant="outlined"
                    color="secondary"
                    onClick={handleResendOtp}
                    disabled={countdown > 0 || isSubmitting}
                    loading={isSubmitting}
                    data-testid="resend-otp"
                    sx={{ flex: 1, minWidth: 0 }}
                  >
                    {t("sign-in:actions.resendOtp")}{" "}
                    {countdown > 0 ? `(${countdown}s)` : ""}
                  </Button>
                </Stack>
              )}
            </Grid>
          </Grid>
        </form>
      </Container>
    </FormProvider>
  );
}

function SignIn() {
  return <Form />;
}

export default withPageRequiredGuest(SignIn);
