import { router } from 'expo-router';
import { type ComponentProps, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[0-9()+\-\s]{7,}$/;

type FormState = {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const initialForm: FormState = {
  name: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
};

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};

  if (!form.name.trim()) {
    errors.name = 'Enter your full name';
  }
  if (!form.email.trim()) {
    errors.email = 'Enter your email address';
  } else if (!EMAIL_PATTERN.test(form.email.trim())) {
    errors.email = 'Enter a valid email address';
  }
  if (!form.phone.trim()) {
    errors.phone = 'Enter your phone number';
  } else if (!PHONE_PATTERN.test(form.phone.trim())) {
    errors.phone = 'Enter a valid phone number';
  }
  if (!form.password) {
    errors.password = 'Enter a password';
  } else if (form.password.length < 8) {
    errors.password = 'Password must be at least 8 characters';
  }
  if (form.confirmPassword !== form.password) {
    errors.confirmPassword = 'Passwords do not match';
  }

  return errors;
}

export default function SignUpScreen() {
  const theme = useTheme();
  const [form, setForm] = useState<FormState>(initialForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function updateField(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit() {
    const validationErrors = validate(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setSubmitting(true);
    try {
      // TODO: replace with a real account-creation request once a backend is wired up.
      await new Promise((resolve) => setTimeout(resolve, 600));
      Alert.alert('Account created', `Welcome, ${form.name.trim()}!`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.select({ ios: 'padding', default: undefined })}>
        <SafeAreaView style={styles.flex} edges={['bottom']}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled">
            <ThemedView style={styles.form}>
              <ThemedText type="title" style={styles.title}>
                Create Account
              </ThemedText>

              <Field
                label="Full name"
                value={form.name}
                onChangeText={(value) => updateField('name', value)}
                error={errors.name}
                autoComplete="name"
                textContentType="name"
              />

              <Field
                label="Email"
                value={form.email}
                onChangeText={(value) => updateField('email', value)}
                error={errors.email}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
              />

              <Field
                label="Phone number"
                value={form.phone}
                onChangeText={(value) => updateField('phone', value)}
                error={errors.phone}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
              />

              <Field
                label="Password"
                value={form.password}
                onChangeText={(value) => updateField('password', value)}
                error={errors.password}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
              />

              <Field
                label="Confirm password"
                value={form.confirmPassword}
                onChangeText={(value) => updateField('confirmPassword', value)}
                error={errors.confirmPassword}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
              />

              <Pressable
                onPress={handleSubmit}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.submitButton,
                  { backgroundColor: theme.text, opacity: pressed || submitting ? 0.7 : 1 },
                ]}>
                <ThemedText style={{ color: theme.background }} type="smallBold">
                  {submitting ? 'Creating account…' : 'Create account'}
                </ThemedText>
              </Pressable>
            </ThemedView>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
} & Pick<
  ComponentProps<typeof TextInput>,
  'keyboardType' | 'autoCapitalize' | 'autoComplete' | 'textContentType' | 'secureTextEntry'
>;

function Field({ label, value, onChangeText, error, ...inputProps }: FieldProps) {
  const theme = useTheme();

  return (
    <ThemedView style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.backgroundElement,
            borderColor: error ? '#e5484d' : 'transparent',
          },
        ]}
        {...inputProps}
      />
      {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
  },
  form: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    marginBottom: Spacing.two,
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    height: 48,
    borderRadius: Spacing.two,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  errorText: {
    color: '#e5484d',
    fontSize: 12,
  },
  submitButton: {
    height: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
});
