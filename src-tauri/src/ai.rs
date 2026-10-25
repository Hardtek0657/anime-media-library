use serde::{Deserialize, Serialize};

const SERVICE: &str = "anime-media-library";
const ACCOUNT: &str = "deepseek";
const ENDPOINT: &str = "https://api.deepseek.com/chat/completions";
const MODEL: &str = "deepseek-chat";

const PROMPT: &str = "You complete entries in a personal anime catalogue. Reply with one JSON object and nothing else. Use only facts you are confident about; omit a field when you do not know it. Shape: {\"title\": string, \"year\": number or null, \"format\": \"TV\" or \"Movie\" or \"OVA\" or \"ONA\" or \"Special\", \"seasons\": [{\"number\": number, \"episodes\": number}], \"description\": string}. seasons lists every season in order with its episode count; use 2.5 style numbers for half seasons. description is at most two sentences. No markdown, no code fences.";

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SeasonSuggestion {
    pub number: f64,
    pub episodes: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Suggestion {
    pub title: String,
    pub year: Option<i64>,
    pub format: String,
    pub seasons: Vec<SeasonSuggestion>,
    pub description: String,
}

#[derive(Debug, Deserialize)]
struct ModelSeason {
    number: f64,
    episodes: i64,
}

#[derive(Debug, Deserialize)]
struct ModelAnswer {
    title: Option<String>,
    year: Option<i64>,
    format: Option<String>,
    seasons: Option<Vec<ModelSeason>>,
    description: Option<String>,
}

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, ACCOUNT).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn ai_has_key() -> bool {
    entry()
        .and_then(|entry| entry.get_password().map_err(|error| error.to_string()))
        .map(|key| !key.trim().is_empty())
        .unwrap_or(false)
}

#[tauri::command]
pub fn ai_set_key(key: String) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("The key is empty.".into());
    }
    entry()?
        .set_password(key)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn ai_clear_key() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn ai_lookup(title: String) -> Result<Suggestion, String> {
    let title = title.trim();
    if title.is_empty() {
        return Err("Type the title first, then ask for a suggestion.".into());
    }
    let key = entry()?
        .get_password()
        .map_err(|_| "No API key saved yet. Add one in AI settings.".to_string())?;

    let body = serde_json::json!({
        "model": MODEL,
        "messages": [
            { "role": "system", "content": PROMPT },
            { "role": "user", "content": format!("Title: {title}") }
        ],
        "response_format": { "type": "json_object" },
        "temperature": 0.2,
        "max_tokens": 700
    });

    let response = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| error.to_string())?
        .post(ENDPOINT)
        .bearer_auth(key)
        .json(&body)
        .send()
        .map_err(|error| format!("Could not reach DeepSeek: {error}"))?;

    let status = response.status();
    if !status.is_success() {
        let detail = response.text().unwrap_or_default();
        return Err(http_error(status.as_u16(), &detail));
    }

    let payload: serde_json::Value = response
        .json()
        .map_err(|error| format!("DeepSeek sent something unreadable: {error}"))?;
    let content = payload["choices"][0]["message"]["content"]
        .as_str()
        .ok_or("DeepSeek returned no text.")?;

    parse_answer(content, title)
}

fn http_error(status: u16, detail: &str) -> String {
    match status {
        401 => "DeepSeek rejected the API key. Check it in AI settings.".to_string(),
        402 => "The DeepSeek account has no balance.".to_string(),
        429 => "DeepSeek is rate limiting. Try again in a moment.".to_string(),
        _ => {
            let trimmed: String = detail.chars().take(200).collect();
            format!("DeepSeek answered {status}. {trimmed}")
        }
    }
}

fn parse_answer(content: &str, fallback_title: &str) -> Result<Suggestion, String> {
    let text = content
        .trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let answer: ModelAnswer = serde_json::from_str(text)
        .map_err(|_| "DeepSeek did not return the expected JSON.".to_string())?;

    let title = answer
        .title
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback_title.to_string());

    let format = match answer.format.as_deref().map(str::trim) {
        Some("Movie") => "Movie",
        Some("OVA") => "OVA",
        Some("ONA") => "ONA",
        Some("Special") => "Special",
        _ => "TV",
    }
    .to_string();

    let mut seasons: Vec<SeasonSuggestion> = Vec::new();
    for season in answer.seasons.unwrap_or_default() {
        if !(season.number.is_finite() && season.number > 0.0 && season.number <= 200.0) {
            continue;
        }
        if !(1..=2000).contains(&season.episodes) {
            continue;
        }
        if seasons.iter().any(|kept| (kept.number - season.number).abs() < f64::EPSILON) {
            continue;
        }
        seasons.push(SeasonSuggestion {
            number: season.number,
            episodes: season.episodes,
        });
    }
    seasons.sort_by(|left, right| left.number.total_cmp(&right.number));
    seasons.truncate(60);

    let description = answer
        .description
        .map(|value| value.trim().to_string())
        .unwrap_or_default();
    let description: String = description.chars().take(2000).collect();

    let year = answer.year.filter(|year| (1900..=2100).contains(year));

    Ok(Suggestion {
        title,
        year,
        format,
        seasons,
        description,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_plain_answer() {
        let answer = parse_answer(
            r#"{"title":"Frieren","year":2023,"format":"TV","seasons":[{"number":1,"episodes":28}],"description":"An elf mage."}"#,
            "frieren",
        )
        .unwrap();
        assert_eq!(answer.title, "Frieren");
        assert_eq!(answer.year, Some(2023));
        assert_eq!(answer.format, "TV");
        assert_eq!(
            answer.seasons,
            vec![SeasonSuggestion { number: 1.0, episodes: 28 }]
        );
    }

    #[test]
    fn strips_code_fences_and_orders_seasons() {
        let answer = parse_answer(
            "```json\n{\"title\":\"Conan\",\"seasons\":[{\"number\":2.5,\"episodes\":12},{\"number\":1,\"episodes\":24}]}\n```",
            "conan",
        )
        .unwrap();
        assert_eq!(
            answer.seasons,
            vec![
                SeasonSuggestion { number: 1.0, episodes: 24 },
                SeasonSuggestion { number: 2.5, episodes: 12 },
            ]
        );
    }

    #[test]
    fn drops_impossible_values_and_duplicates() {
        let answer = parse_answer(
            r#"{"format":"Podcast","year":12,"seasons":[{"number":1,"episodes":12},{"number":1,"episodes":13},{"number":-2,"episodes":12},{"number":3,"episodes":0}]}"#,
            "fallback",
        )
        .unwrap();
        assert_eq!(answer.title, "fallback");
        assert_eq!(answer.format, "TV");
        assert_eq!(answer.year, None);
        assert_eq!(answer.seasons, vec![SeasonSuggestion { number: 1.0, episodes: 12 }]);
    }

    #[test]
    fn refuses_non_json() {
        assert!(parse_answer("I could not find that.", "x").is_err());
    }
}
